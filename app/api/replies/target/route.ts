import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import {
  resolveReplyTargetByBrandName,
  resolveReplyTargetByThreadId,
  senderForChannel,
} from "@/lib/notion/reply-target";
import { hasReplyIngestToken } from "@/lib/reply-ingest-auth";

export async function GET(request: Request) {
  try {
    const ingestAuth = hasReplyIngestToken(request);
    const viewer = ingestAuth ? null : await viewerFromRequest(request);
    if (!ingestAuth && !viewer?.email) {
      return Response.json({ error: "Sign in or ingest token required" }, { status: 401 });
    }

    const search = new URL(request.url).searchParams;
    const threadId = search.get("threadId") || search.get("thread") || "";
    const taskId = search.get("taskId") || search.get("task") || "";
    const name = search.get("name") || "";
    const channel = search.get("channel") || undefined;
    const resolved = threadId
      ? await resolveReplyTargetByThreadId(threadId, taskId)
      : await resolveReplyTargetByBrandName(name, channel);
    if (!resolved.ok) {
      return Response.json({ error: resolved.error }, { status: resolved.status });
    }

    if (!ingestAuth && viewer) {
      if (!canWriteBrand(viewer, resolved.target.brand)) {
        return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
      }
    }

    const { brand, contact, task, outbound } = resolved.target;
    return Response.json({
      brandId: brand.id,
      brandName: brand.name,
      contactId: contact.id,
      contactName: contact.name,
      contactRole: contact.role,
      followupStatus: contact.followupStatus,
      contactOrder: contact.contactOrder,
      email: contact.email,
      phone: contact.phone,
      linkedin: contact.linkedin,
      taskId: task?.id || outbound?.taskId || null,
      taskChannel: task?.channel || outbound?.channel || null,
      taskStatus: task?.status || null,
      threadId: outbound?.threadId || threadId || null,
      outboundMessageId: outbound?.messageId || null,
      sourceBombName: task?.sourceBombName || null,
      senders: {
        Email: senderForChannel(contact, "Email"),
        LinkedIn: senderForChannel(contact, "LinkedIn"),
        SMS: senderForChannel(contact, "SMS"),
        WhatsApp: senderForChannel(contact, "WhatsApp"),
        Phone: senderForChannel(contact, "Phone"),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
