import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { channelReachable, unavailableChannelMessage } from "@/lib/channel-availability";
import { EmailCcError, normalizeEmailCc } from "@/lib/email-cc";
import { prepareEmailContent } from "@/lib/email-html";
import { firstRelationId, propertyText, relationIds, retrievePage } from "@/lib/notion/client";
import { listFollowupContactIds, mapFollowupContact } from "@/lib/notion/contacts";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import {
  createHumanOutbound,
  markFollowupClientEngaged,
  type DeliveryMode,
} from "@/lib/notion/followup-writes";
import {
  channelSupportsEmailAttachments,
  sanitizeEmailAttachments,
} from "@/lib/email-attachments";
import { channelSupportsMedia, sanitizeMediaAttachments } from "@/lib/media-attachments";
import { interactionCpCode } from "@/lib/outreach-domain";
import { isAllowedS3MediaUrl } from "@/lib/s3-media";

type Params = { params: Promise<{ id: string }> };

function asDeliveryMode(value?: string | null): DeliveryMode {
  return value === "immediate" ? "immediate" : "scheduled";
}

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      contactId?: string;
      channel?: string;
      content?: string;
      object?: string;
      subject?: string;
      cc?: string;
      taskId?: string;
      threadId?: string;
      deliveryMode?: string;
      scheduledAt?: string;
      attachments?: unknown;
    };
    const contactId = body.contactId?.trim() || "";
    if (!contactId) {
      return Response.json({ error: "contactId is required" }, { status: 400 });
    }

    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    const brandPriority = propertyText(page.properties?.Priority) || null;

    const relatedContactIds = relationIds(page.properties?.["Follow-up Contacts"]);
    let contactAllowed = relatedContactIds.includes(contactId);
    if (!contactAllowed) {
      const contactIds = await listFollowupContactIds(id, relatedContactIds);
      contactAllowed = contactIds.includes(contactId);
    }
    if (!contactAllowed) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }

    const contactPage = await retrievePage(contactId);
    const contactClientId = firstRelationId(contactPage.properties?.["Follow-up Client"]);
    if (contactClientId && contactClientId !== id) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }
    const contact = await mapFollowupContact(contactPage);
    const contactName = contact.name || "Contact";
    const contactFollowupStatus = contact.followupStatus;
    const contactFollowupMode = contact.followupMode;

    const channel = body.channel || "";
    const object = (body.object ?? body.subject)?.trim() || "";
    if (channel === "Email" && !object) {
      return Response.json({ error: "object (email subject) is required for Email" }, { status: 400 });
    }
    const hasCcInput = body.cc != null && String(body.cc).trim() !== "";
    if (hasCcInput && channel !== "Email") {
      return Response.json({ error: "cc is only valid for Email" }, { status: 400 });
    }
    let cc: string | null = null;
    if (channel === "Email") {
      try {
        cc = normalizeEmailCc(body.cc);
      } catch (error) {
        const message = error instanceof EmailCcError ? error.message : "Invalid cc";
        return Response.json({ error: message }, { status: 400 });
      }
    }
    if (!channelReachable(contact, channel)) {
      return Response.json({ error: unavailableChannelMessage(channel) }, { status: 400 });
    }
    const attachments = channelSupportsMedia(channel)
      ? sanitizeMediaAttachments(body.attachments).filter((item) => isAllowedS3MediaUrl(item.url))
      : channelSupportsEmailAttachments(channel)
        ? sanitizeEmailAttachments(body.attachments).filter((item) => isAllowedS3MediaUrl(item.url))
        : [];
    if (
      Array.isArray(body.attachments) &&
      body.attachments.length &&
      !channelSupportsMedia(channel) &&
      !channelSupportsEmailAttachments(channel)
    ) {
      return Response.json({ error: "Attachments are only supported on Email and WhatsApp" }, { status: 400 });
    }
    let content = body.content || "";
    if (channel === "Email") {
      try {
        const prepared = prepareEmailContent(content, isAllowedS3MediaUrl);
        content = prepared.content;
        if (prepared.kind === "empty" && !attachments.length) {
          return Response.json({ error: "Message content is required" }, { status: 400 });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid email HTML";
        return Response.json({ error: message }, { status: 400 });
      }
    } else if (!content.trim() && !attachments.length) {
      return Response.json({ error: "Message content is required" }, { status: 400 });
    }

    const deliveryMode = asDeliveryMode(body.deliveryMode);
    const created = await createHumanOutbound({
      brandId: id,
      brandName: brand.name,
      brandOwnerId: brand.ownerId,
      brandStatus: brand.status,
      brandPriority,
      contactId,
      contactName,
      contactFollowupStatus,
      contactFollowupMode,
      channel,
      content,
      subject: channel === "Email" ? object : undefined,
      cc: channel === "Email" ? cc : undefined,
      sender: channel === "LinkedIn" ? undefined : viewer.email,
      existingTaskId: body.taskId,
      threadId: body.threadId,
      cpId: brand.currentCpId,
      cpAtInteraction: interactionCpCode(brand.currentCp),
      deliveryMode,
      scheduledAt: body.scheduledAt,
      attachments,
    });

    await markFollowupClientEngaged(id, {
      note: "已发送人工消息。",
      knownStatus: brand.status,
      knownHandlingMode: brand.handlingMode,
    });

    return Response.json({
      ok: true,
      taskId: created.taskId,
      conversationId: created.conversationId,
      scheduledAt: created.scheduledAt,
      deliveryMode: created.deliveryMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message.includes("404")
        ? 404
        : /LinkedIn|quota|capacity|reply|open LinkedIn|Daily Max|active sender|paused|No available send slot|needs review|Channel Daily Max|Unsupported channel|unavailable/i.test(message)
          ? 400
          : 500;
    return Response.json({ error: message }, { status });
  }
}
