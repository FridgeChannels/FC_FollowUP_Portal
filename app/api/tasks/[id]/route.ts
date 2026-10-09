import { canAssignBrandOwner, canViewTask, canWriteTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { updateFollowupTask } from "@/lib/notion/followup-writes";
import {
  buildCallerTaskDetailPayload,
  buildDashboardTaskDetailPayload,
  buildTaskDetailPayload,
} from "@/lib/notion/task-detail";
import { retrieveFollowupTask } from "@/lib/notion/tasks";
import { canManuallyCancelTaskStatus } from "@/lib/outreach-domain";
import { dialPhoneForTask } from "@/lib/quo/config";
import { recordQuoDialAttempt } from "@/lib/quo/dial-attempts";

type Params = { params: Promise<{ id: string }> };

function requestOptionsForViewer(viewer: { role: string }, request: Request) {
  if (viewer.role === "Caller") return true;
  const url = new URL(request.url);
  return url.searchParams.get("lite") === "1";
}

async function taskPayload(
  id: string,
  lite: boolean,
  useDashboardCache = false,
  selectedCallId?: string | null,
) {
  if (useDashboardCache) return buildDashboardTaskDetailPayload(id, selectedCallId);
  return lite ? buildCallerTaskDetailPayload(id) : buildTaskDetailPayload(id);
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const lite = requestOptionsForViewer(viewer, request);
    const url = new URL(request.url);
    const useDashboardCache = url.searchParams.get("source") === "dashboard";
    const payload = await taskPayload(id, lite, useDashboardCache, url.searchParams.get("callId"));
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
    if (body.status === "Cancelled" && !canManuallyCancelTaskStatus(task.status)) {
      return Response.json({ error: "Only Pending tasks can be cancelled" }, { status: 400 });
    }
    const extras: string[] = [];
    if (body.status === "Completed") extras.push("人工结束任务。");
    if (body.status === "Cancelled") extras.push("人工取消未发送任务。");
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
    return Response.json(await taskPayload(id, requestOptionsForViewer(viewer, request)));
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
      phone?: string;
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
      phone: dialPhoneForTask(typeof body.phone === "string" && body.phone.trim() ? body.phone : task.contactPhone),
      contactId: task.contactId,
      brandId: task.brandId,
      brandName: task.brandName,
      contactName: task.contactName,
      channel: task.channel,
    });
    if (task.status !== "Cancelled" && task.status !== "Canceled" && (task.status === "Pending" || task.callReviewStatus === "Unqualified")) {
      await updateFollowupTask(task.id, {
        status: "In Progress",
      });
    }
    return Response.json(await taskPayload(id, requestOptionsForViewer(viewer, request)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
