import { canViewTask } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { propertyText, retrievePage, titleFromProperties } from "@/lib/notion/client";
import { retrieveFollowupTask } from "@/lib/notion/tasks";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) return Response.json({ error: "Sign in required" }, { status: 401 });

    const { id } = await params;
    const task = await retrieveFollowupTask(id);
    if (!canViewTask(viewer, task)) return Response.json({ error: "You do not have access to this task" }, { status: 403 });
    if (task.channel !== "Phone" || !task.templateId) return Response.json({ script: null });

    const template = await retrievePage(task.templateId);
    const properties = template.properties || {};
    const type = propertyText(properties.Type) || propertyText(properties["Template Type"]);
    if (type !== "Call Script") return Response.json({ script: null });

    return Response.json({ script: {
      id: template.id,
      name: titleFromProperties(properties) || "Untitled call script",
      content: propertyText(properties["Content Template"]),
      status: propertyText(properties["Template Status"]) || null,
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
