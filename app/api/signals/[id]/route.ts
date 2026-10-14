import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { canWriteBrand } from "@/lib/brand-access";
import { retrievePage } from "@/lib/notion/client";
import {
  mapFollowupClientDetail,
  mapFollowupClientPage,
} from "@/lib/notion/followup-clients";
import { loadSignalEvents, saveSignalReadState, saveSignalSnapshot } from "@/lib/signals/data";
import { signalsWritesEnabled, isSignalsDevMode } from "@/lib/signals/config";
import { classifySignalEvents, effectiveFollowup, type SignalReview } from "@/lib/signals/model";

type Params = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Params) {
  try {
    const viewer = await viewerFromRequest(request);
    if (!viewer.email)
      return Response.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const page = await retrievePage(id);
    const brand = await mapFollowupClientPage(page);
    if (!canWriteBrand(viewer, brand))
      return Response.json(
        { error: "You do not have access to this brand" },
        { status: 403 },
      );
    const body = (await request.json()) as {
      action?: string;
      eventIds?: string[];
      taskId?: string;
      activityId?: string;
      surface?: "signals" | "brand";
      sampleEventIds?: string[];
    };
    if (body.action !== "read" && !signalsWritesEnabled())
      return Response.json(
        {
          error:
            "Signals is in read-only preview. Review updates are disabled.",
        },
        { status: 423 },
      );
    if (
      !["read", "review", "later", "handled"].includes(body.action || "") ||
      (body.surface !== undefined && body.surface !== "signals" && body.surface !== "brand") ||
      (body.sampleEventIds !== undefined && body.surface !== "brand") ||
      !Array.isArray(body.eventIds) ||
      !body.eventIds.every((id) => typeof id === "string") ||
      (body.surface === "brand" && body.sampleEventIds !== undefined &&
        (!Array.isArray(body.sampleEventIds) || !body.sampleEventIds.every((id) => typeof id === "string"))) ||
      !(body.eventIds.length || (body.surface === "brand" && body.sampleEventIds?.length))
    )
      return Response.json(
        { error: "A valid action and event snapshot are required" },
        { status: 400 },
      );
    const { events, notifications } = await loadSignalEvents(id);
    const freshEvents = classifySignalEvents(events, { devMode: isSignalsDevMode() }).filter((e) => e.isNewSignal);
    const allowed = new Set(freshEvents.map((e) => e.id));
    const requestedIds = [...body.eventIds, ...(body.surface === "brand" ? body.sampleEventIds || [] : [])];
    if (requestedIds.some((id) => !allowed.has(id)))
      return Response.json(
        { error: "Signal snapshot is no longer available. Refresh and retry." },
        { status: 409 },
      );
    const review: Omit<SignalReview, "eventIds"> = { status: "Reviewed" };
    if (body.action === "handled") {
      const detail = await mapFollowupClientDetail(page, {
        includeActivities: true,
      });
      const activity = detail.activities.find((a) => a.id === body.activityId);
      const after = Math.max(
        ...events
          .filter((e) => body.eventIds!.includes(e.id))
          .map((e) => Date.parse(e.detectedAt)),
      );
      if (!activity || !effectiveFollowup(activity, after))
        return Response.json(
          {
            error:
              "A successfully sent message or completed connected call is required",
          },
          { status: 409 },
        );
      review.status = "Handled";
    }
    if (body.action === "later") {
      const detail = await mapFollowupClientDetail(page);
      const task = detail.tasks.find(
        (task) =>
          task.id === body.taskId &&
          !["Completed", "Cancelled", "Failed"].includes(task.status || "") &&
          task.scheduledAt &&
          Date.parse(task.scheduledAt) > Date.now(),
      );
      if (!task)
        return Response.json(
          {
            error: "Choose an existing scheduled follow-up task for this brand",
          },
          { status: 400 },
        );
      review.status = "Later";
      review.taskId = task.id;
    }
    console.info("[signals] snapshot write", {
      brandId: id,
      action: body.action,
      surface: body.surface || "signals",
      events: body.eventIds.length + (body.surface === "brand" ? body.sampleEventIds?.length || 0 : 0),
      owner: viewer.ownerId || viewer.email,
    });
    if (body.action === "read") {
      const ownerId = viewer.ownerId || viewer.email;
      const snapshot = (type: string) => {
        const row = notifications.find((item) =>
          item.brand_id === id && item.type === type && item.owner_id === ownerId,
        );
        try {
          const value = row?.body ? JSON.parse(row.body) as { eventIds?: unknown } : null;
          return value && Array.isArray(value.eventIds)
            ? value.eventIds.filter((eventId): eventId is string => typeof eventId === "string")
            : [];
        } catch {
          return [];
        }
      };
      const previousSignalsRead = snapshot("signals.read");
      const previousBrandRead = notifications.some((item) =>
        item.brand_id === id && item.type === "signals.brand_read" && item.owner_id === ownerId,
      );
      const eventsById = new Map(events.map((event) => [event.id, event]));
      if (body.surface === "brand") {
        const sampleIds = body.sampleEventIds || [];
        const sharedIds = body.eventIds;
        const legacySampleIds = previousSignalsRead.filter((eventId) => eventsById.get(eventId)?.type === "sample");
        await saveSignalReadState({
          brandId: id,
          ownerId,
          ...(sharedIds.length ? { signalsEventIds: [...new Set([...previousSignalsRead, ...sharedIds])] } : {}),
          brandSampleEventIds: [...new Set([...(previousBrandRead ? snapshot("signals.brand_read") : legacySampleIds), ...sampleIds])],
        });
      } else {
        const nextSignalsRead = body.eventIds;
        await saveSignalReadState({
          brandId: id,
          ownerId,
          signalsEventIds: nextSignalsRead,
          ...(!previousBrandRead
            ? { initializeBrandSampleEventIds: previousSignalsRead.filter((eventId) => eventsById.get(eventId)?.type === "sample") }
            : {}),
        });
      }
    } else {
      await saveSignalSnapshot(
        id,
        viewer.ownerId || viewer.email,
        body.eventIds,
        "review",
        review,
      );
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to save review",
      },
      { status: 503 },
    );
  }
}
