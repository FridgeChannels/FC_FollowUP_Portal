import { currentCpOption } from "@/lib/brand-list";
import { canAssignBrandOwner, canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { propertyText, retrievePage, type NotionPage } from "@/lib/notion/client";
import { attachBrandReplySignals, listBrandReplySignals } from "@/lib/notion/brand-reply-signals";
import { listCheckpoints, resolveCheckpoint } from "@/lib/notion/cps";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { updateFollowupClient } from "@/lib/notion/followup-writes";
import { encodeFollowUpReminder } from "@/lib/followup-reminder";
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
      extras.push(encodeFollowUpReminder({ dueAt: body.followUpAt, note: body.note.trim(), ownerId: brand.ownerId }));
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
    const updatedPage = await retrievePage(id);
    const [updated, cps] = await Promise.all([
      mapDetailWithReplySignal(updatedPage),
      listCheckpoints(),
    ]);
    return Response.json({ brand: updated, cps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /^(Invalid channel type|Invalid Amazon product details|Enter a valid|Product details are too long|A note is required)/.test(message)
      ? 400
      : message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
