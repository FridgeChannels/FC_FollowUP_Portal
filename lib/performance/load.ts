import { notionFetch, firstRelationId, propertyDate, propertyText, relationIds, titleFromProperties, type NotionPage, type NotionProperty } from "../notion/client";
import { getClientDbId, getFollowupClientDbId, getFollowupContactDbId, getFollowupConversationDbId, getFollowupTaskDbId } from "../notion/config";
import { listCheckpoints } from "../notion/cps";
import { queryOwnerPages } from "../notion/owners";
import { supabaseSelect } from "../supabase/client";
import { communicationRoundId, taskRoundId, type FollowupRound, type ExhibitionEncounter, type RoundAssignment } from "../followup-history";
import { identity, type SourceData } from "./data";
import { nonTestClientFilter } from "../notion/owner-filter";
import { parseNfcCardSns } from "../sample/sns";

function relationScopes(relations: { property: string; ids: string[] }[]) {
  const conditions = relations.flatMap(({ property, ids }) => [...new Set(ids)].map(id => ({ property, relation: { contains: id } })));
  const scopes: Record<string, unknown>[] = [];
  for (let i = 0; i < conditions.length; i += 80) scopes.push({ or: conditions.slice(i, i + 80) });
  return scopes;
}

/** Read only. No history seeding, Notion projection repair, or sample sync. */
async function leanPages(databaseId: string, names: string[], filters: Record<string, unknown>[] = [{}]) {
  if (!filters.length) return [];
  const schema = await notionFetch<{ properties: Record<string, { id: string }> }>("/databases/" + databaseId);
  const propertyIds = names.flatMap(name => schema.properties[name] ? [schema.properties[name].id] : []);
  const query = new URLSearchParams();
  propertyIds.forEach(id => query.append("filter_properties", id));
  const pagesByFilter = await Promise.all(filters.map(async filter => {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const page = await notionFetch<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        "/databases/" + databaseId + "/query?" + query.toString(),
        { method: "POST", body: JSON.stringify({ page_size: 100, start_cursor: cursor, ...(Object.keys(filter).length ? { filter } : {}) }), signal: AbortSignal.timeout(30_000) },
      );
      pages.push(...page.results);
      cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    } while (cursor);
    return pages;
  }));
  const pages = pagesByFilter.flat();
  const uniquePages = [...new Map(pages.map(page => [identity(page.id), page])).values()];
  // Notion truncates relation values after 25 links, even on fully paged lists.
  for (const page of uniquePages) {
    for (const name of names) {
      const property = page.properties?.[name] as (NotionProperty & { has_more?: boolean }) | undefined;
      if (property?.type !== "relation" || !property.has_more) continue;
      const ids: string[] = [];
      let propertyCursor: string | undefined;
      do {
        const params = new URLSearchParams({ page_size: "100" });
        if (propertyCursor) params.set("start_cursor", propertyCursor);
        const items = await notionFetch<{ results: { relation?: { id: string } }[]; has_more: boolean; next_cursor: string | null }>(
          "/pages/" + page.id + "/properties/" + schema.properties[name].id + "?" + params.toString(),
        );
        items.results.forEach(item => { if (item.relation) ids.push(item.relation.id); });
        propertyCursor = items.has_more && items.next_cursor ? items.next_cursor : undefined;
      } while (propertyCursor);
      property.relation = [...new Set(ids)].map(id => ({ id }));
    }
  }
  console.info("[performance] source loaded", { databaseId, records: uniquePages.length });
  return uniquePages;
}

async function linkedPages(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  console.info("[performance] linked metadata", { records: uniqueIds.length });
  const pages: NotionPage[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, uniqueIds.length) }, async () => {
    while (next < uniqueIds.length) {
      const id = uniqueIds[next++];
      pages.push(await notionFetch<NotionPage>("/pages/" + id, { signal: AbortSignal.timeout(60_000) }));
    }
  }));
  return pages;
}

async function tableRows<T>(table: string, select: string, order = "id.asc", filters?: Record<string, string>) {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const batch = await supabaseSelect<T>(table, { select, order, filters, offset, limit: 500 });
    rows.push(...batch);
    if (batch.length < 500) break;
    offset += batch.length;
  }
  return rows;
}

async function load(onCore?: (data: SourceData) => void): Promise<SourceData> {
  const unavailable: string[] = [];
  const optional = async <T>(name: string, promise: Promise<T>): Promise<T | null> => {
    try { return await promise; }
    catch { unavailable.push(name + " is temporarily unavailable."); return null; }
  };
  const [followups, checkpoints, owners, rounds, encounters, assignments, taps] = await Promise.all([
    leanPages(getFollowupClientDbId(), ["Follow-up Client", "Client", "Is Test", "Follow-up Exhibition", "Current CP", "Owner", "Follow-up Status"], [nonTestClientFilter()]),
    listCheckpoints(),
    queryOwnerPages(),
    optional("Follow-up Rounds", tableRows<FollowupRound>("followup_rounds", "id,brand_id,round_number,status,assigned_am_id,assigned_am_name,origin_encounter_id,current_cp,started_at,paused_at,completed_at,migrated,created_at,updated_at")),
    optional("Exhibition Encounters", tableRows<ExhibitionEncounter>("followup_encounters", "id,brand_id,exhibition_id,exhibition_name,round_id,meeting_at,created_at")),
    optional("AM assignment history", tableRows<RoundAssignment>("followup_assignment_history", "id,round_id,previous_am_id,previous_am_name,new_am_id,new_am_name,changed_at")),
    optional("Sample Tap records", tableRows<{ id: string; brand_id: string | null; occurred_at: string }>("sample_tap_visits", "id,brand_id,occurred_at", "id.asc", { is_internal: "eq.false", brand_id: "not.is.null" })),
  ]);
  const ownerById = new Map(owners.map(o => [identity(o.id), o]));
  const visible = followups.filter(p => !p.properties?.["Is Test"]?.checkbox);
  const visibleIds = new Set(visible.map(p => identity(p.id)));
  const clientIds = [...new Set(visible.flatMap(p => relationIds(p.properties?.Client)))];
  const realClients = new Set(clientIds.map(identity));
  const relatedClients = await leanPages(getClientDbId(), ["Company Name", "Related Events", "Parent / Master Record", "NFC Card SN"], relationScopes([{ property: "Follow up Client", ids: visible.map(p => p.id) }]));
  const clients = relatedClients.filter(p => realClients.has(identity(p.id)));
  const foundClients = new Set(clients.map(p => identity(p.id)));
  clients.push(...await linkedPages(clientIds.filter(id => !foundClients.has(identity(id)))));
  // Master profiles are identity metadata, not additional acquired brands.
  const profiles = [...clients];
  const knownProfiles = new Set(profiles.map(p => identity(p.id)));
  while (true) {
    const missing = [...new Set(profiles.flatMap(p => relationIds(p.properties?.["Parent / Master Record"])))].filter(id => !knownProfiles.has(identity(id)));
    if (!missing.length) break;
    missing.forEach(id => knownProfiles.add(identity(id)));
    profiles.push(...await linkedPages(missing));
  }
  const scopedEncounters = encounters?.filter(e => visibleIds.has(identity(e.brand_id))) ?? null;
  const exhibitionIds = [...new Set([
    ...visible.flatMap(p => relationIds(p.properties?.["Follow-up Exhibition"])),
    ...(scopedEncounters || []).map(e => e.exhibition_id),
  ])];
  const scopedExhibitions = new Set(exhibitionIds.map(identity));
  const exhibitions = await linkedPages(exhibitionIds);
  console.info("[performance] follow-up scope", { brands: visible.length, profiles: clients.length, exhibitions: exhibitions.length });
  const safeRounds = rounds?.filter(r => visibleIds.has(identity(r.brand_id))) ?? null;
  const roundIds = new Set((safeRounds || []).map(r => r.id));
  const core: SourceData = {
    loadedAt: new Date().toISOString(),
    unavailable,
    brands: profiles.map(p => ({
      id: p.id, name: titleFromProperties(p.properties), createdAt: p.created_time!,
      masterId: firstRelationId(p.properties?.["Parent / Master Record"]) || null,
      exhibitions: relationIds(p.properties?.["Related Events"]).filter(id => scopedExhibitions.has(identity(id))),
      sampleLinkCount: parseNfcCardSns(propertyText(p.properties?.["NFC Card SN"])).length,
    })),
    followups: visible.map(p => {
      const ownerId = firstRelationId(p.properties?.Owner) || null;
      return { id: p.id, name: titleFromProperties(p.properties), clientId: firstRelationId(p.properties?.Client) || null,
        createdAt: p.created_time!, sourceExhibitionId: firstRelationId(p.properties?.["Follow-up Exhibition"]) || null,
        cp: firstRelationId(p.properties?.["Current CP"]) || null, status: propertyText(p.properties?.["Follow-up Status"]), ownerId,
        ownerName: ownerId ? ownerById.get(identity(ownerId))?.name || null : null };
    }),
    exhibitions: exhibitions.map(p => ({ id: p.id, name: titleFromProperties(p.properties) })),
    checkpoints: checkpoints.map(cp => ({ id: cp.id, name: cp.name, definition: cp.definition })),
    owners: owners.filter(o => o.status === "Active" && o.role !== "Caller").map(o => ({ id: o.id, name: o.name })),
    rounds: safeRounds,
    encounters: scopedEncounters,
    assignments: assignments?.filter(a => roundIds.has(a.round_id)) ?? null,
    communications: null,
    tasks: null,
    taps: taps?.filter(t => t.brand_id && visibleIds.has(identity(t.brand_id))).map(t => ({ id: t.id, brandId: t.brand_id!, at: t.occurred_at })) ?? null,
  };
  onCore?.(core);
  const contacts = await optional("Contact attribution", leanPages(getFollowupContactDbId(), ["Follow-up Client"], relationScopes([{ property: "Follow-up Client", ids: visible.map(p => p.id) }])));
  const contactBrands = new Map((contacts || []).map(p => [identity(p.id), firstRelationId(p.properties?.["Follow-up Client"]) || null]));
  const brandFor = (page: NotionPage) => firstRelationId(page.properties?.["Follow-up Client"]) || contactBrands.get(identity(firstRelationId(page.properties?.["Follow-up Contact"]) || "")) || null;
  const allowedPage = (page: NotionPage) => {
    const id = brandFor(page);
    return !!id && visibleIds.has(identity(id));
  };
  const communicationScopes = relationScopes([
    { property: "Follow-up Client", ids: visible.map(p => p.id) },
    { property: "Follow-up Contact", ids: (contacts || []).map(p => p.id) },
  ]);
  const [communications, tasks] = await Promise.all([
    optional("Communication records", leanPages(getFollowupConversationDbId(), ["Follow-up Client", "Follow-up Contact", "Follow-up Task", "Extended Parameters", "Thread ID", "Message ID", "Channel", "Direction", "Interaction At", "Content", "Call Result"], communicationScopes)),
    optional("Task records", leanPages(getFollowupTaskDbId(), ["Follow-up Client", "Follow-up Contact", "Owner", "Notes", "OmniReach Run Id", "Task Status", "Ended At"], communicationScopes)),
  ]);
  return {
    ...core,
    communications: contacts === null ? null : communications?.filter(allowedPage).map(p => ({
      id: p.id, brandId: brandFor(p), roundId: communicationRoundId(propertyText(p.properties?.["Extended Parameters"])),
      taskId: firstRelationId(p.properties?.["Follow-up Task"]) || null,
      contactId: firstRelationId(p.properties?.["Follow-up Contact"]) || null,
      threadId: propertyText(p.properties?.["Thread ID"]) || null,
      messageId: propertyText(p.properties?.["Message ID"]) || null,
      channel: propertyText(p.properties?.Channel), direction: propertyText(p.properties?.Direction),
      at: propertyDate(p.properties?.["Interaction At"]), hasContent: !!propertyText(p.properties?.Content).trim(),
      callResult: propertyText(p.properties?.["Call Result"]) || null,
    })) ?? null,
    tasks: contacts === null ? null : tasks?.filter(allowedPage).map(p => ({
      id: p.id, brandId: brandFor(p), roundId: taskRoundId(propertyText(p.properties?.Notes)),
      runId: propertyText(p.properties?.["OmniReach Run Id"]) || null, createdAt: p.created_time || null,
      status: propertyText(p.properties?.["Task Status"]), endedAt: propertyDate(p.properties?.["Ended At"]),
      ownerId: firstRelationId(p.properties?.Owner) || null, notes: propertyText(p.properties?.Notes) || null,
    })) ?? null,
    taps: core.taps,
  };
}

let cache: { expiresAt: number; data: SourceData } | undefined;
let pending: Promise<SourceData> | undefined;
export function loadPerformanceSource(refresh = false, onCore?: (data: SourceData) => void): Promise<SourceData> {
  if (!refresh && cache && cache.expiresAt > Date.now()) {
    onCore?.(cache.data);
    return Promise.resolve(cache.data);
  }
  if (pending) return pending.then(data => { onCore?.(data); return data; });
  pending = load(onCore).then(data => {
    // Performance is read-only and has a manual refresh control. Reuse the
    // expensive Notion snapshot across normal page visits for five minutes.
    cache = { expiresAt: Date.now() + 5 * 60_000, data };
    return data;
  }).finally(() => { pending = undefined; });
  return pending;
}
