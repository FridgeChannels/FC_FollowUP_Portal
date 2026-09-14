import type { CurrentCpOption } from "@/lib/brand-list";
import { listCheckpoints } from "@/lib/notion/cps";
import { canAssignBrandOwner, canViewTask, canWriteTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { retrievePage } from "@/lib/notion/client";
import { listConversationsByIds, listFollowupConversations } from "@/lib/notion/conversations";
import { mapFollowupClientDetail, mapFollowupClientPage } from "@/lib/notion/followup-clients";
import { completeFollowupCall, updateFollowupTask } from "@/lib/notion/followup-writes";
import { interactionCpCode } from "@/lib/outreach-domain";
import { annotateTasksWithReplyInbox } from "@/lib/notion/reply-inbox";
import { retrieveFollowupTask } from "@/lib/notion/tasks";
import { dialPhoneForTask } from "@/lib/quo/config";
import { recordQuoDialAttempt } from "@/lib/quo/dial-attempts";

type Params = { params: Promise<{ id: string }> };

function loadCurrentCps(): Promise<CurrentCpOption[]> {
  return listCheckpoints();
}

async function taskPayload(id: string) {
  const task = await retrieveFollowupTask(id);
  const [byIds, byContact, brand, cps] = await Promise.all([
    listConversationsByIds(task.conversationIds),
    task.contactId ? listFollowupConversations([task.contactId]) : Promise.resolve([]),
    task.brandId
      ? retrievePage(task.brandId).then(mapFollowupClientDetail).catch(() => null)
      : Promise.resolve(null),
    loadCurrentCps(),
  ]);
  const seen = new Set<string>();
  const activities = [...byIds, ...byContact].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const [annotated] = annotateTasksWithReplyInbox([task], activities);
  return { task: annotated || task, activities, brand, cps };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    const { id } = await params;
    const payload = await taskPayload(id);
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
    return Response.json(await taskPayload(id));
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
      outcome?: string;
      summary?: string;
    };
    const task = await retrieveFollowupTask(id);
    if (!canWriteTask(viewer, task)) {
      return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    }
    if (body.action === "quo-attempt") {
      if (task.channel !== "Phone") {
        return Response.json({ error: "quo-attempt is only valid for Phone tasks" }, { status: 400 });
      }
      await recordQuoDialAttempt({
        taskId: task.id,
        phone: dialPhoneForTask(task.contactPhone),
        contactId: task.contactId,
      });
      return Response.json(await taskPayload(id));
    }
    if (body.action !== "complete-call") {
      return Response.json({ error: "Unsupported task action" }, { status: 400 });
    }
    if (!task.contactId) {
      return Response.json({ error: "Task has no Follow-up Contact" }, { status: 400 });
    }
    const brand = task.brandId
      ? await mapFollowupClientPage(await retrievePage(task.brandId)).catch(() => null)
      : null;
    await completeFollowupCall({
      taskId: id,
      brandName: task.brandName || "Untitled Client",
      contactId: task.contactId,
      contactName: task.contactName || "KeyPerson",
      outcome: body.outcome || "Other",
      summary: body.summary,
      sender: viewer.email,
      cpId: brand?.currentCpId,
      cpAtInteraction: interactionCpCode(brand?.currentCp),
    });
    return Response.json(await taskPayload(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("404") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
