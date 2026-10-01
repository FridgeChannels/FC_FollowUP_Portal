import { canAccessTestBrands, isTestOnlyViewer } from "@/lib/brand-access";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { getDisplayTimeZone } from "@/lib/display-time";
import { listCurrentQualifiedPhoneTasks } from "@/lib/notion/tasks";
import { buildQualifiedCallDashboard } from "@/lib/qualified-call-dashboard";
import { runWithNotionLimit } from "@/lib/notion/rate-limit";

async function getQualifiedCalls(request: Request) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email) {
      return Response.json({ error: "Sign in required" }, { status: 401 });
    }
    if (!viewer.isAdmin && viewer.role !== "Caller") {
      return Response.json({ error: "You do not have access to this dashboard" }, { status: 403 });
    }

    const tasks = await listCurrentQualifiedPhoneTasks({
      includeTest: canAccessTestBrands(viewer),
      onlyTest: isTestOnlyViewer(viewer),
    });
    const timeZone = getDisplayTimeZone();
    const dashboard = buildQualifiedCallDashboard(tasks, timeZone);
    const days = viewer.role === "Caller"
      ? dashboard
        .map((day) => {
          const callers = day.callers.filter((caller) =>
            caller.id === viewer.ownerId || caller.email === viewer.email?.trim().toLowerCase(),
          );
          return {
            ...day,
            total: callers.reduce((sum, caller) => sum + caller.total, 0),
            callers,
          };
        })
        .filter((day) => day.total > 0)
      : dashboard;
    return Response.json({
      timeZone,
      days,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export function GET(request: Request) {
  return runWithNotionLimit(() => getQualifiedCalls(request));
}
