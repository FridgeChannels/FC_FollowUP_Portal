import { canAssignBrandOwner, canViewTask, canWriteTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { updateFollowupTask } from "@/lib/notion/followup-writes";
import {
  buildCallerTaskDetailPayload,
  buildTaskDetailPayload,
} from "@/lib/notion/task-detail";
import { retrieveFollowupTask } from "@/lib/notion/tasks";
import { dialPhoneForTask } from "@/lib/quo/config";
import { recordQuoDialAttempt } from "@/lib/quo/dial-attempts";

type Params = { params: Promise<{ id: string }> };

function litePayloadForViewer(viewer: { role: string }, request: Request) {
  if (viewer.role === "Caller") return true;
  const url = new URL(request.url);
  return url.searchParams.get("lite") === "1";
}

async function taskPayload(id: string, lite: boolean) {
  return lite ? buildCallerTaskDetailPayload(id) : buildTaskDetailPayload(id);
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const lite = litePayloadForViewer(viewer, request);
    const payload = await taskPayload(id, lite);
    if (!canViewTask(viewer, payload.task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }
    return Response.json(payload);
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
      status?: string;
      ownerId?: string | null;
      notes?: string;
    };
    const task = await retrieveFollowupTask(id);
    if (!canWriteTask(viewer, task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }
    if (body.ownerId !== undefined && !canAssignBrandOwner(viewer)) {
      return Response.json({ error: "Only Admin can assign Owner" }, { status: 403 });
    }
    const extras: string[] = [];
    if (body.status === "Completed") extras.push("人工结束任务。");
    if (body.notes?.trim()) extras.push(body.notes.trim());
    const notes = extras.length ? extras.join("") : undefined;
    await updateFollowupTask(id, {
      status: body.status,
      ownerId: body.ownerId,
      notes,
      endedAt: body.status === "Completed" || body.status === "Failed" || body.status === "Cancelled"
        ? new Date().toISOString()
        : undefined,
    });
    return Response.json(await taskPayload(id, litePayloadForViewer(viewer, request)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as {
      action?: string;
    };
    const task = await retrieveFollowupTask(id);
    if (!canWriteTask(viewer, task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }
    if (body.action !== "quo-attempt") {
      return Response.json({ error: "Unsupported task action" }, { status: 400 });
    }
    if (task.channel !== "Phone") {
      return Response.json({ error: "quo-attempt is only valid for Phone tasks" }, { status: 400 });
    }
    await recordQuoDialAttempt({
      taskId: task.id,
      phone: dialPhoneForTask(task.contactPhone),
      contactId: task.contactId,
      brandId: task.brandId,
      brandName: task.brandName,
      contactName: task.contactName,
      channel: task.channel,
    });
    if (task.status === "Pending" || task.callReviewStatus === "Unqualified") {
      await updateFollowupTask(task.id, {
        status: "In Progress",
        ...(task.callReviewStatus === "Unqualified"
          ? { callReviewStatus: null, endedAt: null }
          : {}),
      });
    }
    return Response.json(await taskPayload(id, litePayloadForViewer(viewer, request)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
