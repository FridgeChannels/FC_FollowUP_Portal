import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { firstRelationId, relationIds, retrievePage, titleFromProperties } from "@/lib/notion/client";
import { listFollowupContactIds } from "@/lib/notion/contacts";
import { mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { createHumanOutbound, markFollowupClientEngaged } from "@/lib/notion/followup-writes";
import { interactionCpCode } from "@/lib/outreach-domain";

type Params = { params: Promise<{ id: string }> };

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
      taskId?: string;
      threadId?: string;
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
    const contactName = titleFromProperties(contactPage.properties) || "Contact";

    const channel = body.channel || "";
    const object = (body.object ?? body.subject)?.trim() || "";
    if (channel === "Email" && !object) {
      return Response.json({ error: "object (email subject) is required for Email" }, { status: 400 });
    }

    const created = await createHumanOutbound({
      brandName: brand.name,
      brandOwnerId: brand.ownerId,
      contactId,
      contactName,
      channel,
      content: body.content || "",
      subject: channel === "Email" ? object : undefined,
      sender: viewer.email,
      existingTaskId: body.taskId,
      threadId: body.threadId,
      cpId: brand.currentCpId,
      cpAtInteraction: interactionCpCode(brand.currentCp),
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
