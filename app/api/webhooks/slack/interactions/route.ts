import { getSlackSigningSecret } from "@/lib/notify/config";
import {
  findInternalDeviceAction,
  internalDeviceStatusBlocks,
  parseSlackInteractionBody,
  slackUserLabel,
} from "@/lib/notify/slack-interactions";
import { verifySlackSignature } from "@/lib/notify/slack-signature";
import { markInternalDevice, unmarkInternalDevice } from "@/lib/sample/internal-devices";
import { markSampleNotificationsReadForDevice } from "@/lib/sample/notifications";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const RESPONSE_URL_TIMEOUT_MS = 3000;

async function postToResponseUrl(responseUrl: string | undefined, body: Record<string, unknown>) {
  if (!responseUrl?.startsWith("https://hooks.slack.com/")) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESPONSE_URL_TIMEOUT_MS);
  try {
    const response = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("[slack/interactions] response_url failed", { status: response.status });
    }
  } catch (error) {
    console.error("[slack/interactions] response_url failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Slack App Interactivity Request URL.
 *
 * POST /api/webhooks/slack/interactions
 * Content-Type: application/x-www-form-urlencoded (payload=<json>)
 * Signed with SLACK_SIGNING_SECRET.
 */
export async function POST(request: Request) {
  const signingSecret = getSlackSigningSecret();
  if (!signingSecret) {
    return Response.json({ error: "SLACK_SIGNING_SECRET is not configured" }, { status: 503 });
  }

  const body = await request.text();
  if (!verifySlackSignature({ body, headers: request.headers, signingSecret })) {
    return Response.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  const payload = parseSlackInteractionBody(body);
  if (!payload) return Response.json({ error: "Missing payload" }, { status: 400 });

  const action = findInternalDeviceAction(payload);
  // Other actions (e.g. URL buttons) still need a 200 ack.
  if (!action) return new Response(null, { status: 200 });
  const target = action.value;
  const actionLabel = action.kind === "mark" ? "Mark internal" : "Undo";

  if (!isSupabaseConfigured()) {
    await postToResponseUrl(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: `${actionLabel} failed: Supabase is not configured.`,
    });
    return new Response(null, { status: 200 });
  }

  try {
    if (action.kind === "mark") {
      await markInternalDevice({
        deviceId: target.deviceId,
        label: slackUserLabel(payload.user),
        note: "Marked internal from Slack notification",
      });
    } else {
      await unmarkInternalDevice(target.deviceId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const detail =
      error && typeof error === "object" && "body" in error && typeof (error as { body: unknown }).body === "string"
        ? (error as { body: string }).body.slice(0, 300)
        : "";
    const status =
      error && typeof error === "object" && "status" in error ? (error as { status: unknown }).status : null;
    console.error("[slack/interactions] internal device update failed", {
      kind: action.kind,
      deviceId: target.deviceId,
      message,
      status,
      detail,
    });
    await postToResponseUrl(payload.response_url, {
      response_type: "ephemeral",
      replace_original: false,
      text: `${actionLabel} failed: ${message}${status ? ` (HTTP ${status})` : ""}${detail ? ` — ${detail}` : ""}`,
    });
    return new Response(null, { status: 200 });
  }

  let clearedUnread = 0;
  if (action.kind === "mark" && target.brandId) {
    try {
      clearedUnread = await markSampleNotificationsReadForDevice(target.brandId, target.deviceId);
    } catch (error) {
      console.error("[slack/interactions] clear unread failed", {
        brandId: target.brandId,
        deviceId: target.deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await postToResponseUrl(payload.response_url, {
    replace_original: true,
    text: payload.message?.text || "Sample tap",
    blocks: internalDeviceStatusBlocks(payload.message?.blocks, {
      action,
      userId: payload.user?.id || null,
      clearedUnread,
    }),
  });

  return new Response(null, { status: 200 });
}
