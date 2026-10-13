import { emptyFollowupHistory, FollowupError, type EncounterInput, type FollowupHistory } from "./followup-history";
import { SupabaseError, supabaseRpc, supabaseSelect, supabasePatch } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/config";
import { firstRelationId, notionFetch, propertyText, retrievePage, type NotionPage } from "./notion/client";
import { getFollowupClientDbId } from "./notion/config";
import { mapFollowupClientPage } from "./notion/followup-clients";
import { retrieveOwner } from "./notion/owners";
import { resolveCheckpoint } from "./notion/cps";
import { updateFollowupClient } from "./notion/followup-writes";
import { encodeBrandAssignment } from "./brand-assignment";
import { encodeFollowUpReminder } from "./followup-reminder";
import { invalidateAllPortalCaches } from "./notion/portal-caches";

function mapError(error: unknown): never {
  if (error instanceof SupabaseError) {
    let detail: { message?: string; code?: string } = {};
    try { detail = JSON.parse(error.body); } catch { /* Keep server internals out of the client response. */ }
    if (detail.code === "P0001" || detail.code === "23505") throw new FollowupError(detail.message || "Follow-up changed; refresh and retry", 409);
    if (detail.code === "22023") throw new FollowupError(detail.message || "Invalid follow-up action");
    if (error.status === 404 || /PGRST202|42P01|42883/.test(detail.code || "")) throw new FollowupError("Follow-up database migration is not installed", 503);
  }
  throw error;
}
async function rpc<T>(name: string, args: Record<string, unknown>) {
  if (!isSupabaseConfigured()) throw new FollowupError("Follow-up storage is not configured", 503);
  try { return await supabaseRpc<T>(name, args); } catch (error) { mapError(error); }
}
export async function followupHistory(brandId: string): Promise<FollowupHistory> {
  const history = await rpc<FollowupHistory>("followup_history", { p_brand_id: brandId });
  const unread = await supabaseSelect<{ id: string }>("system_notifications", {
    select: "id", filters: { brand_id: `eq.${brandId}`, type: "eq.encounter.updated", read_at: "is.null" }, limit: 100,
  });
  return { ...history, unreadEncounterCount: unread.length };
}
export async function optionalFollowupHistory(brandId: string) {
  try { return await followupHistory(brandId); }
  catch (error) {
    return emptyFollowupHistory(error instanceof FollowupError ? error.message : "Follow-up history temporarily unavailable");
  }
}
async function seedFromPage(page: NotionPage) {
  const brand = await mapFollowupClientPage(page);
  return { clientId: firstRelationId(page.properties?.Client), status: brand.status, ownerId: brand.ownerId, ownerName: brand.ownerName,
    currentCpId: brand.currentCpId, startedAt: brand.ownerAssignedAt || null };
}
export async function seedFollowupHistory(page: NotionPage) {
  return rpc<FollowupHistory>("followup_mutate", { p_brand_id: page.id, p_action: "seed", p_payload: {}, p_seed: await seedFromPage(page) });
}
/** Pending state is durable; reads and retried writes repair failed Notion projections. */
export async function projectFollowupState(brandId: string): Promise<boolean> {
  const claimed = await rpc<{ token: string; patch: Record<string, unknown> } | null>("followup_projection", { p_brand_id: brandId, p_action: "claim" });
  if (!claimed) return false;
  try {
    const patch = { ...claimed.patch };
    const page = await retrievePage(brandId);
    const notes = typeof patch.notes === "string" ? patch.notes : propertyText(page.properties?.Notes);
    const extras: string[] = [];
    if (("ownerId" in patch || patch.newAssignment) && !("notes" in patch)) {
      extras.push(encodeBrandAssignment({ ownerId: typeof patch.ownerId === "string" ? patch.ownerId : "ownerId" in patch ? null : firstRelationId(page.properties?.Owner) || null, assignedAt: new Date().toISOString() }));
    }
    if (!("notes" in patch) && typeof patch.note === "string" && patch.note) extras.push(patch.note);
    if (!("notes" in patch) && patch.status === "Paused" && typeof patch.followUpAt === "string" && typeof patch.note === "string") {
      extras.push(encodeFollowUpReminder({ dueAt: patch.followUpAt, note: patch.note, ownerId: firstRelationId(page.properties?.Owner) || null }));
    }
    if (extras.length) patch.notes = [notes, ...extras].filter(Boolean).join("\n");
    await updateFollowupClient(brandId, patch);
    await rpc("followup_projection", { p_brand_id: brandId, p_action: "ack", p_token: claimed.token });
    invalidateAllPortalCaches();
    return true;
  } catch (error) {
    await rpc("followup_projection", { p_brand_id: brandId, p_action: "release", p_token: claimed.token });
    throw error;
  }
}
export async function mutateFollowup(page: NotionPage, action: "start" | "resume" | "patch" | "encounter", payload: Record<string, unknown>) {
  await projectFollowupState(page.id);
  const next = { ...payload };
  if ("ownerId" in next && next.ownerId) {
    const owner = await retrieveOwner(String(next.ownerId));
    if (!owner || owner.status !== "Active" || !["Admin", "AccountManager"].includes(owner.role)) throw new FollowupError("Choose an active Account Manager");
    next.ownerName = owner.name;
  }
  if (next.currentCpId) {
    const cp = await resolveCheckpoint(String(next.currentCpId));
    if (!cp) throw new FollowupError("Unknown Current CP");
    next.currentCpId = cp.id;
  }
  const result = await rpc<FollowupHistory>("followup_mutate", { p_brand_id: page.id, p_action: action, p_payload: next, p_seed: await seedFromPage(page) });
  if (action !== "encounter") {
    try { await projectFollowupState(page.id); }
    catch { return { ...result, projectionPending: true }; }
  }
  return result;
}
export async function saveEncounter(page: NotionPage, input: EncounterInput) {
  return mutateFollowup(page, "encounter", { ...input });
}
export async function enrichEncounter(brandId: string, encounterId: string, changes: import("./followup-history").KeyChange[]) {
  return rpc<FollowupHistory>("followup_enrich_encounter", { p_brand_id: brandId, p_encounter_id: encounterId, p_changes: changes });
}
export async function markEncountersRead(brandId: string, ownerId: string | null, isAdmin: boolean) {
  await supabasePatch("system_notifications", { read_at: new Date().toISOString() }, {
    brand_id: `eq.${brandId}`, type: "eq.encounter.updated", read_at: "is.null", ...(!isAdmin ? { owner_id: `eq.${ownerId}` } : {}),
  });
}
/** Shared Client identity wins over a display name. Never creates another Brand. */
export async function resolveExhibitionBrand(input: { brandId?: unknown; clientId?: unknown }) {
  if (typeof input.brandId === "string" && input.brandId.trim()) {
    const page = await retrievePage(input.brandId.trim());
    if (page.parent?.database_id?.replace(/-/g, "") !== getFollowupClientDbId().replace(/-/g, "")) throw new FollowupError("Provide a Follow-up Brand ID", 400);
    if (typeof input.clientId === "string" && firstRelationId(page.properties?.Client)?.replace(/-/g, "") !== input.clientId.replace(/-/g, "")) throw new FollowupError("Brand and Client identities do not match", 409);
    return page;
  }
  if (typeof input.clientId !== "string" || !input.clientId.trim()) throw new FollowupError("Provide an existing Brand ID or Client ID");
  const result = await notionFetch<{ results: NotionPage[] }>(`/databases/${getFollowupClientDbId()}/query`, {
    method: "POST", body: JSON.stringify({ page_size: 2, filter: { property: "Client", relation: { contains: input.clientId.trim() } } }),
  });
  if (result.results.length !== 1) throw new FollowupError(result.results.length ? "Multiple Brands match this Client; resolve the duplicate before syncing" : "This Client has no Follow-up Brand", result.results.length ? 409 : 404);
  return result.results[0];
}
/** Stored independently of Round progress and guarded against stale generation. */
export async function saveRelationshipSummary(brandId: string, content: string, version: number) {
  return rpc<boolean>("followup_save_summary", { p_brand_id: brandId, p_content: content, p_version: version });
}
