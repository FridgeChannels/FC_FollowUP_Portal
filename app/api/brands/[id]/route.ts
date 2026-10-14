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
      if (!canAssignBrandOwner(viewer)) {
        return Response.json({ error: "Only Admin can resume or reassign a paused FollowUp" }, { status: 403 });
      }
      if (brand.status !== "Paused" || body.status !== "In Progress" || !body.note?.trim()) {
        return Response.json({ error: "A paused FollowUp requires an Admin note before it can be resumed" }, { status: 400 });
      }
      const nextOwnerId = body.ownerId === undefined ? brand.ownerId : body.ownerId;
      if (!nextOwnerId) {
        return Response.json({ error: "Assign an Account Manager before resuming FollowUp" }, { status: 400 });
      }
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
        extras.push(encodeFollowUpReminderResolution({
          dueAt: previousReminder.dueAt,
          resolvedAt: new Date().toISOString(),
          resolvedBy: viewer.ownerId,
          action: "Extended",
        }));
      }
      extras.push(encodeFollowUpReminder({ dueAt: body.followUpAt, note: body.note.trim(), ownerId: brand.ownerId }));
    }
    if (body.resumePausedFollowUp) {
      const reminder = latestFollowUpReminder(propertyText(page.properties?.Notes));
      if (reminder) {
        const nextOwnerId = body.ownerId === undefined ? brand.ownerId : body.ownerId;
        extras.push(encodeFollowUpReminderResolution({
          dueAt: reminder.dueAt,
          resolvedAt: new Date().toISOString(),
          resolvedBy: viewer.ownerId,
          action: nextOwnerId === brand.ownerId ? "Resumed" : "Reassigned",
        }));
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

    await updateFollowupClient(id, {
      currentCpId: body.currentCpId,
      ownerId: body.ownerId,
      status: body.status,
      handlingMode: body.handlingMode,
      notes,
      humanNotes: body.humanNotes,
      channelType: body.channelType,
      amazonSampleProduct: body.amazonSampleProduct,
    });
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
    const status = /^(Invalid channel type|Invalid Amazon product details|Enter a valid|Product details are too long|A note is required|A paused FollowUp requires|Assign an Account Manager)/.test(message)
      ? 400
      : message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
