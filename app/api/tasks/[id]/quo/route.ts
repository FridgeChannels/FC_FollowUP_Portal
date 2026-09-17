import { canViewTask } from "@/lib/brand-access";
import { listConversationsByIds, listFollowupConversations } from "@/lib/notion/conversations";
import { upsertQuoCallActivity } from "@/lib/notion/quo-calls";
import { quoApiConfigured, getQuoCallBundle } from "@/lib/quo/client";
import { getQuoFromNumber } from "@/lib/quo/config";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrieveFollowupTask } from "@/lib/notion/tasks";
import { syncQuoCallDataFromLive } from "@/lib/quo/data";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const viewer = await viewerFromRequest(request);
  if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });
  try {
    const { id } = await params;
    const callId = new URL(request.url).searchParams.get("callId");
    const task = await retrieveFollowupTask(id);
    if (!canViewTask(viewer, task)) return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    const activities = await findQuoCallConversationFromTask(task.id, task.conversationIds, task.contactId);
    const existing = callId
      ? activities.find((item) => item.quo?.callId === callId) || null
      : activities[0] || null;
    const existingData = existing?.quo || null;
    if (!existingData) {
      return Response.json({ configured: quoApiConfigured(), data: null, fromNumber: getQuoFromNumber() || null });
    }
    if (!quoApiConfigured()) return Response.json({ configured: false, data: existingData, fromNumber: getQuoFromNumber() || null });
    const live = await getQuoCallBundle(existingData.callId);
    const data = syncQuoCallDataFromLive(existingData, {
      call: live.call,
      recordings: live.recordings,
      transcript: live.transcript,
      summary: live.summary,
      voicemail: live.voicemail,
    });
    await upsertQuoCallActivity({ task, data, eventType: "call.sync" });
    return Response.json({ configured: true, data, errors: live.errors, fromNumber: getQuoFromNumber() || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Quo call";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function findQuoCallConversationFromTask(taskId: string, conversationIds: string[], contactId: string | null) {
  const fromTask = conversationIds.length ? await listConversationsByIds(conversationIds) : [];
  const fromContact = contactId ? await listFollowupConversations([contactId]) : [];
  const direct = [...fromTask, ...fromContact].filter((item, index, items) => item.taskId === taskId && item.quo && items.findIndex((candidate) => candidate.id === item.id) === index);
  return direct.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
