import { hasReplyIngestToken } from "@/lib/reply-ingest-auth";
import { viewerFromRequest } from "@/lib/brand-viewer-request";
import { canViewBrand, canWriteBrand } from "@/lib/brand-access";
import { resolveExhibitionBrand, followupHistory, seedFollowupHistory, saveEncounter, mutateFollowup, projectFollowupState, enrichEncounter } from "@/lib/followup-data";
import { FollowupError, parseEncounter, encounterKeyContext } from "@/lib/followup-history";
import { retrieveExhibition } from "@/lib/notion/exhibition-writes";
import { mapFollowupClientDetail } from "@/lib/notion/followup-clients";
import { firstRelationId, propertyText, retrievePage } from "@/lib/notion/client";
import { refreshRelationshipSummary, extractEncounterChanges } from "@/lib/relationship-summary";
import { emitNotificationSafe, portalBrandUrl } from "@/lib/notify";

/** Super Exhibition resolves an existing Brand by its shared Client identity. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const machine = hasReplyIngestToken(request);
    const viewer = machine ? null : await viewerFromRequest(request);
    if (!machine && !viewer?.email) throw new FollowupError("Sign in required", 401);
    const page = await resolveExhibitionBrand({ brandId: url.searchParams.get("brandId"), clientId: url.searchParams.get("clientId") });
    const brand = await mapFollowupClientDetail(page);
    if (viewer && !canViewBrand(viewer, brand, brand.tasks)) throw new FollowupError("You do not have access to this brand", 403);
    await seedFollowupHistory(page);
    const history = await followupHistory(page.id);
    const current = history.rounds[0] || null;
    return Response.json({ brandId: page.id, clientId: firstRelationId(page.properties?.Client),
      currentRound: current, currentAM: current ? { id: current.assigned_am_id, name: current.assigned_am_name } : { id: brand.ownerId, name: brand.ownerName },
      previousRoundAM: history.rounds[1] ? { id: history.rounds[1].assigned_am_id, name: history.rounds[1].assigned_am_name } : null,
      currentCP: brand.currentCp, brandSummary: brand.relationshipSummary || brand.aiSummaries?.overall?.content || null,
      keyContext: encounterKeyContext(history), contactRestrictions: brand.contacts.map(c => ({ id: c.id, followupStatus: c.followupStatus, notes: c.notes })), history,
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const machine = hasReplyIngestToken(request);
    const viewer = machine ? null : await viewerFromRequest(request);
    if (!machine && !viewer?.email) throw new FollowupError("Sign in required", 401);
    const body = await request.json() as Record<string, unknown>;
    let page = await resolveExhibitionBrand(body);
    const brand = await mapFollowupClientDetail(page);
    if (viewer && !canWriteBrand(viewer, brand)) throw new FollowupError("You do not have access to this brand", 403);
    if (body.action === "start" || body.action === "resume") {
      // Machine token is the existing trusted integration credential. Human AMs
      // can start/resume their brand, but only Admin may select another AM.
      if (body.ownerId !== undefined && viewer && !viewer.isAdmin) throw new FollowupError("Only Admin can assign an Account Manager", 403);
      if (body.ownerId !== undefined && body.ownerId !== null && typeof body.ownerId !== "string") throw new FollowupError("Invalid Account Manager");
      await projectFollowupState(page.id);
      page = await retrievePage(page.id);
      const history = await mutateFollowup(page, body.action, {
        ...(body.action === "start" && body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
        ...(typeof body.originEncounterId === "string" ? { originEncounterId: body.originEncounterId } : {}),
        ...(typeof body.expectedVersion === "number" ? { expectedVersion: body.expectedVersion } : {}),
        changedBy: viewer?.name || viewer?.email || "Super Exhibition",
      });
      return Response.json({ brandId: page.id, history });
    }
    if (body.action !== undefined && body.action !== "encounter") throw new FollowupError("Invalid synchronization action");
    const encounter = parseEncounter(body.encounter);
    const exhibition = await retrieveExhibition(encounter.exhibitionId);
    encounter.exhibitionId = exhibition.id;
    encounter.exhibitionName = exhibition.name;
    let history = await saveEncounter(page, encounter);
    const duplicate = history.duplicate;
    let keyChangesPending = false;
    let changesExtracted = false;
    const suppliedChanges = body.encounter && typeof body.encounter === "object" && "keyChanges" in body.encounter;
    const existing = history.encounters.find(e => e.id === encounter.id);
    if (!suppliedChanges && !existing?.key_changes.length) {
      const changes = await extractEncounterChanges(encounter);
      if (changes?.length) { history = await enrichEncounter(page.id, encounter.id, changes); changesExtracted = true; }
      keyChangesPending = changes === null && !!encounter.meetingNotes.trim();
    }
    // Updating only significant changes; no task, assignment or CP mutation.
    let summaryUpdated = false;
    const hasChanges = !!history.encounters.find(e => e.id === encounter.id)?.key_changes.length;
    const round = history.rounds.find(r => r.id === history.encounters.find(e => e.id === encounter.id)?.round_id);
    if (hasChanges && (!duplicate || changesExtracted) && round?.assigned_am_id && round.status !== "Completed") {
      // Reuse the configured provider; in-app notification is already committed
      // transactionally. No Signal or follow-up task is created here.
      await emitNotificationSafe({ eventType: "encounter.updated", channel: "Exhibition", brandId: page.id,
        brandName: brand.name, ownerId: round.assigned_am_id, ownerName: round.assigned_am_name,
        sender: encounter.metBy, subject: exhibition.name, messageId: encounter.id,
        contentPreview: history.encounters.find(e => e.id === encounter.id)?.key_changes.map(c => c.text).join("\n"),
        occurredAt: encounter.meetingAt, portalUrl: `${portalBrandUrl(page.id)}?followupHistory=1`,
      });
    }
    if (hasChanges) {
      summaryUpdated = await refreshRelationshipSummary(page.id, history.relationshipSummary || brand.relationshipSummary || propertyText(page.properties?.["Portal Relationship Summary"]) || brand.aiSummaries?.overall?.content || "", history);
    }
    return Response.json({ brandId: page.id, history: { ...history, duplicate }, summaryUpdated, summaryPending: hasChanges && !summaryUpdated, keyChangesPending }, { status: duplicate ? 200 : 201 });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Encounter synchronization failed" }, { status: error instanceof FollowupError ? error.status : 500 });
}
