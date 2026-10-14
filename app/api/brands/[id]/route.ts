import { currentCpOption } from "@/lib/brand-list";
import { canAssignBrandOwner, canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { propertyText, retrievePage, type NotionPage } from "@/lib/notion/client";
import { attachBrandReplySignals, listBrandReplySignals } from "@/lib/notion/brand-reply-signals";
import { listCheckpoints, resolveCheckpoint } from "@/lib/notion/cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { cancelPendingBrandTasks, updateFollowupClient } from "@/lib/notion/followup-writes";
import { encodeFollowUpReminder, encodeFollowUpReminderResolution, latestFollowUpReminder } from "@/lib/followup-reminder";
import { encodeBrandAssignment } from "@/lib/brand-assignment";
import type { AmazonSampleProduct, ChannelType } from "@/lib/sample-product";
import { FOLLOW_UP_STATUSES } from "@/lib/brand-list";
import { followupHistory, mutateFollowup, projectFollowupState, seedFollowupHistory } from "@/lib/followup-data";
import { FollowupError } from "@/lib/followup-history";

type Params = { params: Promise<{ id: string }> };

async function mapDetailWithReplySignal(page: NotionPage) {
  const [brand, replySignals] = await Promise.all([
    mapFollowupClientDetail(page),
    listBrandReplySignals([page]).catch(() => new Map()),
  ]);
  const signal = attachBrandReplySignals([brand], replySignals)[0];
  return {
    ...brand,
    needsReply: signal?.needsReply ?? false,
    replyPreview: signal?.replyPreview ?? null,
    replyDueAt: signal?.replyDueAt ?? null,
    replyUpdatedAt: signal?.replyUpdatedAt ?? null,
  };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const [cps, brand] = await Promise.all([
      listCheckpoints(),
      mapDetailWithReplySignal(page),
    ]);
    if (!canViewBrand(viewer, brand, brand.tasks)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    try {
      await seedFollowupHistory(page);
      if (await projectFollowupState(page.id)) Object.assign(brand, await mapDetailWithReplySignal(await retrievePage(page.id)));
      brand.followupHistory = await followupHistory(page.id);
    } catch (error) {
      // Rollout compatibility: brand/profile/conversations remain readable even
      // before the additive migration or during a history-provider outage.
      brand.followupHistory = { ...(brand.followupHistory || { version: 0, rounds: [], encounters: [], assignments: [], projectionPending: false }), unavailable: error instanceof Error ? error.message : "History unavailable" };
    }
    return Response.json({ brand, cps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      currentCpId?: string | null;
      ownerId?: string | null;
      status?: string | null;
      handlingMode?: string | null;
      evidence?: string;
      note?: string;
      followUpAt?: string;
      humanNotes?: string | null;
      channelType?: ChannelType;
      amazonSampleProduct?: AmazonSampleProduct;
      assignmentHandled?: boolean;
      expectedVersion?: number;
      expectedRoundId?: string | null;
      resumePausedFollowUp?: boolean;
    };
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    if (body.ownerId !== undefined && !canAssignBrandOwner(viewer)) {
      return Response.json({ error: "Only Admin can assign Owner" }, { status: 403 });
    }
    if (body.status !== undefined && (!body.status || !FOLLOW_UP_STATUSES.includes(body.status as typeof FOLLOW_UP_STATUSES[number]))) throw new FollowupError("Invalid follow-up status");
    if (body.ownerId !== undefined && body.ownerId !== null && typeof body.ownerId !== "string") throw new FollowupError("Invalid Account Manager");
    if (body.handlingMode !== undefined && body.handlingMode !== "Human" && body.handlingMode !== "Automated") throw new FollowupError("Invalid handling mode");
    if (body.channelType !== undefined && !["DTC", "Amazon", "DTC&Amazon"].includes(body.channelType)) throw new FollowupError("Invalid channel type");
    if ([body.note, body.humanNotes, body.evidence].some(value=>value!=null&&typeof value!=="string")) throw new FollowupError("Notes must be text");
    if (body.currentCpId !== undefined && body.currentCpId !== null && typeof body.currentCpId !== "string") throw new FollowupError("Invalid Current CP");
    if (body.expectedVersion !== undefined && (!Number.isInteger(body.expectedVersion)||body.expectedVersion<0)) throw new FollowupError("Invalid history version");
    if (body.expectedRoundId !== undefined && body.expectedRoundId !== null && typeof body.expectedRoundId !== "string") throw new FollowupError("Invalid Round ID");
    if (body.amazonSampleProduct !== undefined && (body.ownerId !== undefined || body.status !== undefined || body.currentCpId !== undefined)) throw new FollowupError("Save sample product changes separately from follow-up changes");
    if (body.assignmentHandled && viewer.ownerId !== brand.ownerId) {
      return Response.json({ error: "Only the assigned Account Manager can review this assignment" }, { status: 403 });
    }
    const isAssignedAccountManager = viewer.role === "AccountManager"
      && !!viewer.ownerId
      && !!brand.ownerId
      && viewer.ownerId.replace(/-/g, "").toLowerCase() === brand.ownerId.replace(/-/g, "").toLowerCase();
    if ((body.status === "Paused" || body.status === "Completed") && !isAssignedAccountManager) {
      return Response.json({ error: "Only the assigned Account Manager can pause or complete FollowUp" }, { status: 403 });
    }
    if (body.resumePausedFollowUp) {
      if (!canAssignBrandOwner(viewer)) return Response.json({ error: "Only Admin can resume or reassign a paused FollowUp" }, { status: 403 });
      if (brand.status !== "Paused" || body.status !== "In Progress" || !body.note?.trim()) return Response.json({ error: "A paused FollowUp requires an Admin note before it can be resumed" }, { status: 400 });
      const nextOwnerId = body.ownerId === undefined ? brand.ownerId : body.ownerId;
      if (!nextOwnerId) return Response.json({ error: "Assign an Account Manager before resuming FollowUp" }, { status: 400 });
    }
    if ((body.status === "Paused" || body.status === "Completed") && !body.note?.trim()) {
      return Response.json({ error: "A note is required when pausing or completing FollowUp" }, { status: 400 });
    }
    if (body.followUpAt && (body.status !== "Paused" || !Number.isFinite(Date.parse(body.followUpAt)))) {
      return Response.json({ error: "Enter a valid next contact date when pausing FollowUp" }, { status: 400 });
    }

    const extras: string[] = [];
    if (body.currentCpId && (body.evidence?.trim() || body.note?.trim())) {
      const next =
        (await resolveCheckpoint(body.currentCpId)) || currentCpOption(body.currentCpId);
      extras.push(
        [
          `CP 更新为 ${next.name}。`,
          body.evidence?.trim() ? `证据：${body.evidence.trim()}。` : "",
          body.note?.trim() || "",
        ]
          .filter(Boolean)
          .join(""),
      );
    }
    if (body.status && body.status !== brand.status) {
      extras.push(
        [`状态更新为 ${body.status}。`, body.note?.trim() ? `备注：${body.note.trim()}` : ""]
          .filter(Boolean)
          .join(""),
      );
    }
    if (body.status === "Paused" && body.followUpAt && body.note?.trim()) {
      const previousReminder = latestFollowUpReminder(propertyText(page.properties?.Notes));
      if (brand.status === "Paused" && previousReminder && previousReminder.dueAt !== body.followUpAt) {
        extras.push(encodeFollowUpReminderResolution({ dueAt: previousReminder.dueAt, resolvedAt: new Date().toISOString(), resolvedBy: viewer.ownerId, action: "Extended" }));
      }
      extras.push(encodeFollowUpReminder({ dueAt: body.followUpAt, note: body.note.trim(), ownerId: brand.ownerId }));
    }
    if (body.resumePausedFollowUp) {
      const reminder = latestFollowUpReminder(propertyText(page.properties?.Notes));
      if (reminder) {
        const nextOwnerId = body.ownerId === undefined ? brand.ownerId : body.ownerId;
        extras.push(encodeFollowUpReminderResolution({ dueAt: reminder.dueAt, resolvedAt: new Date().toISOString(), resolvedBy: viewer.ownerId, action: nextOwnerId === brand.ownerId ? "Resumed" : "Reassigned" }));
      }
    }
    if (body.handlingMode && body.handlingMode !== brand.handlingMode) {
      extras.push(`跟进方式更新为 ${body.handlingMode}。`);
    }
    if (body.ownerId !== undefined && body.ownerId !== brand.ownerId) {
      extras.push(encodeBrandAssignment({
        ownerId: body.ownerId?.trim() || null,
        assignedAt: new Date().toISOString(),
      }));
    }
    if (body.assignmentHandled) {
      if (!brand.ownerAssignedAt || !brand.ownerId) {
        return Response.json({ error: "No active assignment to review" }, { status: 400 });
      }
      extras.push(encodeBrandAssignment({
        ownerId: brand.ownerId,
        assignedAt: brand.ownerAssignedAt,
        handledAt: new Date().toISOString(),
      }));
    }
    const notes = extras.length
      ? [propertyText(page.properties?.Notes) || null, ...extras].filter(Boolean).join("\n")
      : undefined;

    const patch = {
      currentCpId: body.currentCpId,
      ownerId: body.ownerId,
      status: body.status,
      handlingMode: body.handlingMode,
      notes,
      humanNotes: body.humanNotes,
      channelType: body.channelType,
      amazonSampleProduct: body.amazonSampleProduct,
    };
    if (body.ownerId !== undefined || body.status !== undefined || body.currentCpId !== undefined) {
      // Keep the existing assignment marker and reminders for existing inboxes;
      // the transaction additionally preserves their Round attribution.
      const mutation = await mutateFollowup(page, "patch", {
        ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
        ...(body.resumePausedFollowUp ? { status: "Paused" } : {}),
        note: body.note, followUpAt: body.followUpAt,
        changedBy: viewer.name || viewer.email,
        ...(body.expectedVersion !== undefined ? { expectedVersion: body.expectedVersion } : {}),
        ...(body.expectedRoundId !== undefined ? { expectedRoundId: body.expectedRoundId } : {}),
      });
      if (body.resumePausedFollowUp) {
        await mutateFollowup(await retrievePage(id), "resume", {
          expectedVersion: mutation.version,
          expectedRoundId: mutation.rounds[0]?.id || null,
          changedBy: viewer.name || viewer.email,
        });
      }
    } else await updateFollowupClient(id, patch);
    const cancelledTasks =
      (body.status === "Paused" || body.status === "Completed") && body.status !== brand.status
        ? await cancelPendingBrandTasks({ brandId: id, reason: body.status })
        : [];
    const updatedPage = await retrievePage(id);
    const [updated, cps] = await Promise.all([
      mapDetailWithReplySignal(updatedPage),
      listCheckpoints(),
    ]);
    return Response.json({ brand: updated, cps, cancelledTaskCount: cancelledTasks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = error instanceof FollowupError ? error.status
      : /^(Invalid channel type|Invalid Amazon product details|Enter a valid|Product details are too long|A note is required)/.test(message) ? 400
      : message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
