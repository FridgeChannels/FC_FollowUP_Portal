import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
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
      taskId?: string;
      threadId?: string;
    };
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    const detail = await mapFollowupClientDetail(page);
    const contact = detail.contacts.find((item) => item.id === body.contactId);
    if (!contact) {
      return Response.json({ error: "Contact not found on this brand" }, { status: 400 });
    }
    await createHumanOutbound({
      brandName: brand.name,
      brandOwnerId: brand.ownerId,
      contactId: contact.id,
      contactName: contact.name,
      channel: body.channel || "",
      content: body.content || "",
      sender: viewer.email,
      existingTaskId: body.taskId,
      threadId: body.threadId,
      cpId: brand.currentCpId,
      cpAtInteraction: interactionCpCode(brand.currentCp),
    });
    await markFollowupClientEngaged(id, { note: "已发送人工消息。" });
    return Response.json({
      brand: await mapFollowupClientDetail(await retrievePage(id)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
