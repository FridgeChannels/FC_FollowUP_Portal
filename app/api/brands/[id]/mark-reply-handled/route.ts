import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { invalidateBrandReplySignalCache } from "@/lib/notion/brand-reply-signal-cache";
import {
  firstRelationId,
  relationIds,
  retrievePage,
  updatePage,
  type NotionPage,
} from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { listConversationsByIds, listFollowupConversations } from "@/lib/notion/conversations";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { markInboundsReplied } from "@/lib/notion/followup-writes";

type Params = { params: Promise<{ id: string }> };

async function assertContactOnBrand(brandId: string, contactId: string, brandPage: NotionPage) {
  const relatedContactIds = relationIds(brandPage.properties?.["Follow-up Contacts"]);
  if (relatedContactIds.includes(contactId)) return true;
  const contactIds = await listFollowupContactIds(brandId, relatedContactIds);
  if (contactIds.includes(contactId)) return true;
  const contactPage = await retrievePage(contactId).catch(() => null);
  const contactBrandId = contactPage
    ? firstRelationId(contactPage.properties?.["Follow-up Client"])
    : null;
  return contactBrandId === brandId;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      conversationId?: string;
      contactId?: string;
      channel?: string;
      taskId?: string | null;
      threadId?: string | null;
    };

    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }

    let contactId = body.contactId?.trim() || "";
    let channel = body.channel?.trim() || "";
    let taskId = body.taskId?.trim() || null;
    let threadId = body.threadId?.trim() || null;
    const conversationId = body.conversationId?.trim() || "";

    if (conversationId) {
      const [conversation] = await listConversationsByIds([conversationId]);
      if (!conversation) {
        return Response.json({ error: "Conversation not found" }, { status: 404 });
      }
      if (conversation.direction && conversation.direction !== "Inbound") {
        return Response.json({ error: "Only inbound conversations can be marked handled" }, { status: 400 });
      }
      if (conversation.replyStatus === "Replied") {
        return Response.json({ ok: true, alreadyHandled: true });
      }
      contactId = contactId || conversation.contactId || "";
      channel = channel || conversation.channel || "";
      taskId = taskId || conversation.taskId || null;
      threadId = threadId || conversation.threadId || null;

      if (conversation.brandId && conversation.brandId !== id) {
        return Response.json({ error: "Conversation does not belong to this brand" }, { status: 400 });
      }
      if (!conversation.brandId && conversation.contactId) {
        const allowed = await assertContactOnBrand(id, conversation.contactId, page);
        if (!allowed) {
          return Response.json({ error: "Conversation does not belong to this brand" }, { status: 400 });
        }
      }
    }

    if (!contactId) {
      return Response.json({ error: "contactId is required" }, { status: 400 });
    }
    if (!channel) {
      return Response.json({ error: "channel is required" }, { status: 400 });
    }

    const contactAllowed = await assertContactOnBrand(id, contactId, page);
    if (!contactAllowed) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }

    // Always clear the opened inbound row, even when thread/task matching would miss.
    if (conversationId) {
      await updatePage(conversationId, {
        "Reply Status": { select: { name: "Replied" } },
      });
    }

    const activities = await listFollowupConversations([contactId]);
    await markInboundsReplied(
      { contactId, channel, taskId, threadId },
      activities,
    );
    // markInboundsReplied no-ops (and skips cache bust) when thread/task filters miss.
    invalidateBrandReplySignalCache();

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") || message.includes("object_not_found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
