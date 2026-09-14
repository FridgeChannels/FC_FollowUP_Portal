import { canWriteBrand } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { InboundReplyError, ingestInboundReply } from "@/lib/notion/inbound-reply";
import { annotateTasksWithReplyInbox } from "@/lib/notion/reply-inbox";
import { listFollowupConversations } from "@/lib/notion/conversations";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand)) {
      return Response.json({ error: "You do not have access to this brand" }, { status: 403 });
    }
    const body = (await request.json()) as {
      contactId?: string;
      channel?: string;
      content?: string;
      taskId?: string;
      sender?: string;
    };
    const ingested = await ingestInboundReply({
      brandId: id,
      contactId: body.contactId,
      channel: body.channel,
      content: body.content,
      sender: body.sender,
      taskId: body.taskId,
      notes: "客户回复已入库，尚未人工处理。",
    });
    const task = await retrieveFollowupTask(ingested.taskId);
    const activities = await listFollowupConversations([ingested.contactId]);
    const [annotated] = annotateTasksWithReplyInbox([task], activities);
    return Response.json({
      task: annotated || task,
      brand: await mapFollowupClientDetail(await retrievePage(id)),
    });
  } catch (error) {
    if (error instanceof InboundReplyError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
