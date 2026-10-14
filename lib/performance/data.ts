import type { FollowupRound, ExhibitionEncounter, RoundAssignment } from "../followup-history.ts";
import { isCpVisible } from "../cp-visibility.ts";

export type Range = { start: string; end: string };
export type Preset = "7" | "30" | "90" | "custom";
export const STAGES = ["CP0", "CP1", "CP2", "CP3", "CP4", "CP5", "CP6", "Nurture"] as const;
export type Stage = typeof STAGES[number];
export const VISIBLE_STAGES = STAGES.filter(stage => stage !== "CP0" && isCpVisible(stage));
export const identity = (id: string) => id.replace(/-/g, "").toLowerCase();
export type Brand = {
  id: string; name: string; createdAt: string; masterId: string | null;
  exhibitions: string[];
  sampleLinkCount?: number;
};
export type Followup = {
  id: string; clientId: string | null; name: string; createdAt: string;
  sourceExhibitionId: string | null; cp: string | null;
  ownerId: string | null; ownerName: string | null;
  status?: string;
};
export type Communication = {
  id: string; brandId: string | null; roundId: string | null; taskId: string | null;
  contactId: string | null; threadId: string | null; messageId: string | null;
  channel: string; direction: string; at: string | null; hasContent: boolean;
  callResult: string | null;
};
export type EffortTask = {
  id: string; brandId: string | null; roundId: string | null; runId: string | null;
  createdAt: string | null; status: string; endedAt: string | null;
  ownerId?: string | null; notes?: string | null;
};
export type SourceData = {
  loadedAt: string;
  brands: Brand[]; followups: Followup[];
  exhibitions: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  checkpoints: { id: string; name: string; definition: string }[];
  rounds: FollowupRound[] | null; encounters: ExhibitionEncounter[] | null;
  assignments: RoundAssignment[] | null;
  communications: Communication[] | null; tasks: EffortTask[] | null;
  taps: { id: string; brandId: string; at: string }[] | null;
  unavailable: string[];
};

export function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function validDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function presetRange(days: number, end = today()): Range {
  const date = new Date(end + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - days + 1);
  return { start: date.toISOString().slice(0, 10), end };
}
export function queryRange(params: Pick<URLSearchParams, "get">): { range: Range; preset: Preset } {
  const raw = params.get("range");
  const preset: Preset = raw === "7" || raw === "90" || raw === "custom" ? raw : "30";
  const start = params.get("start"); const end = params.get("end");
  if (validDate(start) && validDate(end) && start <= end) return { range: { start, end }, preset };
  return { range: presetRange(preset === "custom" ? 30 : Number(preset)), preset: preset === "custom" ? "30" : preset };
}
const time = (at: string | null | undefined) => at ? Date.parse(at) : NaN;
export const bounds = (range: Range) => ({
  start: Date.parse(range.start + "T00:00:00+08:00"),
  end: Date.parse(range.end + "T23:59:59.999+08:00"),
});
function canonical(data: SourceData) {
  const byId = new Map(data.brands.map(brand => [identity(brand.id), brand]));
  return (id: string) => {
    let key = identity(id);
    const seen = new Set<string>();
    while (byId.get(key)?.masterId && !seen.has(key)) {
      seen.add(key); key = identity(byId.get(key)!.masterId!);
    }
    // Deterministic identity for malformed cycles; never deduplicate by name.
    return seen.has(key) ? [...seen].sort()[0] : key;
  };
}
export function stageFor(data: SourceData, value: string | null): Stage | null {
  if (!value || value === "NONE") return "CP0";
  const name = data.checkpoints.find(cp => identity(cp.id) === identity(value))?.name || value;
  return (STAGES as readonly string[]).includes(name) ? name as Stage : null;
}
export function ownerAt(data: SourceData, round: FollowupRound, at: number) {
  if (!data.assignments) return null;
  const history = data.assignments.filter(a => a.round_id === round.id).sort((a, b) => time(a.changed_at) - time(b.changed_at));
  const event = history.filter(a => time(a.changed_at) <= at).at(-1);
  if (event) return { id: event.new_am_id, name: event.new_am_name };
  if (history.length) return { id: history[0].previous_am_id, name: history[0].previous_am_name };
  return { id: round.assigned_am_id, name: round.assigned_am_name };
}
export type Opportunity = {
  id: string; brandId: string | null; followupId: string; name: string; roundNumber: number;
  ownerId: string | null; ownerName: string | null; cp: Stage | null;
  sourceId: string | null; status: string | null; lastInteraction: string | null;
  recordType: "round" | "followup";
};

export function snapshot(data: SourceData, range: Range) {
  const window = bounds(range); const canon = canonical(data);
  const followups = new Map(data.followups.map(f => [identity(f.id), f]));
  const scopedClients = new Set(data.followups.flatMap(f => f.clientId ? [identity(f.clientId)] : []));
  const catalog = data.brands.filter(b => scopedClients.has(identity(b.id)) && time(b.createdAt) <= window.end);
  const acquired = new Set(catalog.map(b => canon(b.id)));
  const recordedRounds = (data.rounds || []).filter(r => {
    const started = r.started_at || (r.migrated ? null : r.created_at);
    return started ? time(started) <= window.end : time(r.created_at) <= window.end;
  });
  const unresolvedStarts = (data.rounds || []).filter(r => r.migrated && !r.started_at && time(r.created_at) > window.end).length;
  const encounters = (data.encounters || []).filter(e => time(e.meeting_at) <= window.end);
  const latest = new Map<string, number>();
  (data.rounds || []).forEach(r => latest.set(identity(r.brand_id), Math.max(latest.get(identity(r.brand_id)) || 0, r.round_number)));
  const opportunities: Opportunity[] = recordedRounds.map(round => {
    const followup = followups.get(identity(round.brand_id));
    const owner = ownerAt(data, round, window.end);
    const origin = encounters.find(e => e.id === round.origin_encounter_id);
    // A legacy single Round may use its explicit Follow-up Exhibition relation.
    // Never carry a brand's current source backwards across multiple Rounds.
    const sourceId = origin?.exhibition_id || (round.round_number === 1 && latest.get(identity(round.brand_id)) === 1 ? followup?.sourceExhibitionId : null) || null;
    const statusKnown = time(round.updated_at) <= window.end;
    return {
      id: round.id, followupId: round.brand_id, recordType: "round",
      brandId: followup?.clientId ? canon(followup.clientId) : null,
      name: followup?.name || "Unavailable brand", roundNumber: round.round_number,
      ownerId: owner?.id || null, ownerName: owner?.name || null,
      cp: statusKnown ? stageFor(data, round.current_cp) : null,
      sourceId, status: statusKnown ? round.status : null, lastInteraction: null,
    };
  });
  const hasRound = new Set((data.rounds || []).map(r => identity(r.brand_id)));
  const currentCutoff = window.end >= time(data.loadedAt);
  const legacy = data.followups.filter(f => !hasRound.has(identity(f.id)) && time(f.createdAt) <= window.end);
  if (data.rounds !== null) opportunities.push(...legacy.map(f => ({
    // This is the actual Follow-up record ID, never a fabricated persisted Round.
    id: f.id, followupId: f.id, recordType: "followup" as const,
    brandId: f.clientId ? canon(f.clientId) : null, name: f.name, roundNumber: 0,
    ownerId: currentCutoff ? f.ownerId : null, ownerName: currentCutoff ? f.ownerName : null,
    cp: currentCutoff ? stageFor(data, f.cp) : null,
    sourceId: currentCutoff ? f.sourceExhibitionId : null,
    status: currentCutoff ? (f.status === "Completed" || f.status === "Terminated" ? "Completed" : f.status || "Active") : null,
    lastInteraction: null,
  })));
  const unresolvedLegacy = currentCutoff ? 0 : legacy.length;
  const roundById = new Map(opportunities.map(r => [r.id, r]));
  const tasks = new Map((data.tasks || []).map(t => [identity(t.id), t]));
  const events = (data.communications || []).flatMap(event => {
    if (!event.at || time(event.at) > window.end) return [];
    const task = event.taskId ? tasks.get(identity(event.taskId)) : undefined;
    const roundId = event.roundId || task?.roundId;
    const candidate = roundId ? roundById.get(roundId) : undefined;
    const round = candidate?.recordType === "round" ? candidate : undefined;
    // Only stored Round stamps establish attribution.
    if (round && event.brandId && identity(event.brandId) !== identity(round.followupId)) return [];
    const stored = round ? recordedRounds.find(r => r.id === round.id)! : null;
    const owner = stored ? ownerAt(data, stored, time(event.at)) : null;
    const linkedFollowup = event.brandId ? followups.get(identity(event.brandId)) : null;
    // Legacy communications without Round markers can still be attributed to
    // the brand's current Owner at the selected cutoff. Do not use this fallback
    // for a stamped but unknown Round or for historical cutoffs.
    const legacyOwner = !event.roundId && currentCutoff ? linkedFollowup?.ownerId : null;
    const profile = event.brandId ? followups.get(identity(event.brandId))?.clientId : null;
    return [{ ...event, roundId: round?.id || null, sourceId: round?.sourceId || null,
      ownerId: owner?.id || legacyOwner || null, profileId: profile ? canon(profile) : null,
      inPeriod: time(event.at) >= window.start }];
  });
  for (const round of opportunities) {
    round.lastInteraction = events.filter(e => round.recordType === "round" ? e.roundId === round.id : e.brandId && identity(e.brandId) === identity(round.followupId)).map(e => e.at!).sort((a, b) => time(a) - time(b)).at(-1) || null;
  }
  const exhibitBrands = new Map<string, Set<string>>();
  const addExhibit = (id: string, brand: string) => {
    const key = identity(id); const set = exhibitBrands.get(key) || new Set<string>();
    set.add(brand); exhibitBrands.set(key, set);
  };
  catalog.forEach(b => b.exhibitions.forEach(id => addExhibit(id, canon(b.id))));
  encounters.forEach(e => {
    const client = followups.get(identity(e.brand_id))?.clientId;
    if (client) { acquired.add(canon(client)); addExhibit(e.exhibition_id, canon(client)); }
  });
  data.followups.filter(f => time(f.createdAt) <= window.end && f.clientId).forEach(f => {
    acquired.add(canon(f.clientId!));
    if (f.sourceExhibitionId) addExhibit(f.sourceExhibitionId, canon(f.clientId!));
  });
  return { data, range, window, opportunities, recordedRounds, unresolvedStarts, unresolvedLegacy, events, exhibitBrands, totalBrands: acquired.size, canonical: canon };
}
export type Snapshot = ReturnType<typeof snapshot>;
const unique = (items: Array<string | null>) => new Set(items.filter((id): id is string => !!id)).size;
export function distribution(rounds: Opportunity[], available: boolean) {
  return Object.fromEntries(STAGES.map(stage => [stage, available ? rounds.filter(r => r.cp === stage).length : null])) as Record<Stage, number | null>;
}
export function metrics(view: Snapshot, amId?: string, exhibitionId?: string) {
  const exhibitKey = exhibitionId ? identity(exhibitionId) : null;
  const scope = view.opportunities.filter(r => !exhibitKey || (r.sourceId && identity(r.sourceId) === exhibitKey));
  const current = scope.filter(r => !amId || r.ownerId && identity(r.ownerId) === identity(amId)).filter(r => !amId || r.status !== "Completed");
  const uncertainExhibition = !!exhibitKey && view.window.end < time(view.data.loadedAt);
  const available = view.data.rounds !== null && (!amId || view.data.assignments !== null) && view.unresolvedStarts === 0 && (!amId || view.unresolvedLegacy === 0) && !uncertainExhibition;
  const assignedAvailable = available && (!amId || current.every(r => r.status !== null));
  const stageCandidates = amId ? scope.filter(r => r.status !== "Completed") : scope;
  const latestBrandOpportunity = new Map<string, Opportunity>();
  stageCandidates.forEach(row => {
    const key = row.brandId || identity(row.followupId);
    const existing = latestBrandOpportunity.get(key);
    if (!existing || row.roundNumber > existing.roundNumber || (row.roundNumber === existing.roundNumber && row.id.localeCompare(existing.id) > 0)) {
      latestBrandOpportunity.set(key, row);
    }
  });
  const stageBrands = [...latestBrandOpportunity.values()].filter(row => !amId || row.ownerId && identity(row.ownerId) === identity(amId));
  const assignedBrandCount = unique(current.map(row => row.brandId || identity(row.followupId)));
  const exhibitionBrands = exhibitKey ? view.exhibitBrands.get(exhibitKey) : undefined;
  // Exhibition communication metrics follow the brands linked to the show,
  // including older records that have no saved Round attribution.
  const scopedEvents = view.events.filter(e => !exhibitKey || !!e.profileId && exhibitionBrands?.has(e.profileId));
  const periodEvents = scopedEvents.filter(e => (!amId || e.inPeriod) && (!amId || e.ownerId && identity(e.ownerId) === identity(amId)));
  const candidateFollowups = new Set(scope.map(r => identity(r.followupId)));
  view.data.followups.forEach(f => {
    if (exhibitKey && f.clientId && view.exhibitBrands.get(exhibitKey)?.has(view.canonical(f.clientId))) candidateFollowups.add(identity(f.id));
    if (amId && f.ownerId && identity(f.ownerId) === identity(amId)) candidateFollowups.add(identity(f.id));
  });
  const unassignedEvents = view.events.filter(e => (!amId || e.inPeriod) && !e.ownerId && e.brandId && candidateFollowups.has(identity(e.brandId)));
  const unknownEvents = unassignedEvents.length;
  const eventsAvailable = view.data.communications !== null && (!amId || view.data.assignments !== null);
  const isReply = (e: Snapshot["events"][number]) => e.direction === "Inbound" && (
    (["Email", "SMS", "WhatsApp", "LinkedIn"].includes(e.channel) && e.hasContent) ||
    (e.channel === "Phone" && e.callResult?.toLowerCase() === "connected")
  );
  const replies = periodEvents.filter(isReply);
  const threads = new Map<string, Snapshot["events"]>();
  scopedEvents.forEach(e => {
    if ((!e.roundId && !e.profileId) || (!e.threadId && !e.contactId)) return;
    const key = (e.roundId || e.profileId!) + ":" + e.channel + ":" + (e.threadId || e.contactId);
    const group = threads.get(key) || []; group.push(e); threads.set(key, group);
  });
  const engaged = [...threads.values()].flatMap(group => {
    let inbound = false; let outbound = false;
    return [...group].sort((a, b) => time(a.at) - time(b.at)).filter(event => {
      inbound ||= isReply(event);
      outbound ||= event.direction === "Outbound";
      return inbound && outbound && (!amId || event.inPeriod) && (!amId || event.ownerId && identity(event.ownerId) === identity(amId));
    });
  });
  engaged.push(...periodEvents.filter(e => e.channel === "Phone" && e.callResult?.toLowerCase() === "connected"));
  const sends = (channel: string) => eventsAvailable && !unassignedEvents.some(e => e.direction === "Outbound" && e.channel === channel) ? unique(periodEvents.filter(e => e.direction === "Outbound" && e.channel === channel).map(e => e.messageId ? channel + ":" + e.messageId : e.id)) : null;
  const calls = eventsAvailable && !unassignedEvents.some(e => e.channel === "Phone" && e.callResult) ? unique(periodEvents.filter(e => e.channel === "Phone" && e.callResult).map(e => e.messageId || e.id)) : null;
  const profileForTask = (brandId: string | null) => {
    if (!brandId) return null;
    const followup = view.data.followups.find(f => identity(f.id) === identity(brandId));
    return followup?.clientId ? view.canonical(followup.clientId) : view.canonical(brandId);
  };
  const isSendMessageTask = (notes: string | null | undefined) => !!notes && (
    notes.includes("[PERFORMANCE_SEND_MESSAGE]") ||
    notes.includes("人工发送消息，尚未实际发送。") ||
    notes.includes("人工追加回复，尚未实际发送。")
  );
  const scopedTasks = (view.data.tasks || []).filter(t =>
    (!exhibitKey || !!t.brandId && !!exhibitionBrands?.has(profileForTask(t.brandId)!)));
  const executedSendTasks = scopedTasks.filter(task => view.events.some(event => event.taskId && identity(event.taskId) === identity(task.id) && event.direction === "Outbound" && event.at &&
    time(event.at) >= view.window.start && time(event.at) <= view.window.end));
  const sendMessageTasks = executedSendTasks.filter(task => isSendMessageTask(task.notes));
  const omniReachSendTasks = executedSendTasks.filter(task => !!task.runId);
  const unknownSendMessageAttribution = sendMessageTasks.some(task => !task.ownerId);
  const unknownOmniReachSendAttribution = omniReachSendTasks.some(task => !task.ownerId);
  const sendMessageSends = sendMessageTasks.filter(task => !amId || task.ownerId && identity(task.ownerId) === identity(amId)).length;
  const omniReachSends = omniReachSendTasks.filter(task => !amId || task.ownerId && identity(task.ownerId) === identity(amId)).length;
  const runTasks = (view.data.tasks || []).filter(t => t.runId && time(t.createdAt) <= view.window.end);
  const runGroups = new Map<string, typeof runTasks>();
  runTasks.forEach(t => { const group = runGroups.get(t.runId!) || []; group.push(t); runGroups.set(t.runId!, group); });
  const runLaunches = [...runGroups.values()].flatMap(group => {
    const first = [...group].sort((a, b) => time(a.createdAt) - time(b.createdAt))[0];
    if (!first.createdAt || time(first.createdAt) < view.window.start) return [];
    const brandId = first.brandId || group.find(task => task.brandId)?.brandId || null;
    const profile = profileForTask(brandId);
    if (exhibitKey && (!profile || !exhibitionBrands?.has(profile))) return [];
    const stored = first.roundId ? view.recordedRounds.find(r => identity(r.id) === identity(first.roundId!)) : undefined;
    const historicalOwner = stored ? ownerAt(view.data, stored, time(first.createdAt)) : null;
    const ownerId = first.ownerId || historicalOwner?.id || null;
    return [{ ownerId, unresolved: !ownerId, inScope: !exhibitKey || !!brandId && !!profile && !!exhibitionBrands?.has(profile) }];
  });
  const unknownRuns = runLaunches.some(run => run.inScope && run.unresolved);
  const runs = runLaunches.filter(run => run.inScope && (!amId || run.ownerId && identity(run.ownerId) === identity(amId))).length;
  const tapped = view.data.taps?.filter(t => {
    const profile = view.data.followups.find(f => identity(f.id) === identity(t.brandId))?.clientId;
    return time(t.at) <= view.window.end && profile && (exhibitKey ? view.exhibitBrands.get(exhibitKey)?.has(view.canonical(profile)) : true);
  });
  const sampleLinksByProfile = new Map(view.data.brands.map(brand => [identity(brand.id), brand.sampleLinkCount || 0]));
  const linkedProfiles = new Set<string>();
  const samplesDelivered = exhibitKey ? view.data.followups.reduce((total, followup) => {
    if (!followup.clientId || !view.exhibitBrands.get(exhibitKey)?.has(view.canonical(followup.clientId))) return total;
    const profileId = identity(followup.clientId);
    if (linkedProfiles.has(profileId)) return total;
    linkedProfiles.add(profileId);
    return total + (sampleLinksByProfile.get(profileId) || 0);
  }, 0) : null;
  return {
    rounds: current, brandRounds: amId ? stageBrands : current,
    assigned: assignedAvailable ? current.length : null, assignedBrands: assignedAvailable ? assignedBrandCount : null,
    brands: exhibitKey ? uncertainExhibition ? null : view.exhibitBrands.get(exhibitKey)?.size || 0 : view.totalBrands,
    samplesDelivered,
    cp: distribution(stageBrands, available), cpTotal: available ? stageBrands.length : null, unknownCP: stageBrands.filter(r => !r.cp).length,
    replied: eventsAvailable && (!amId || exhibitKey || !unassignedEvents.some(isReply)) ? unique(replies.map(e => e.profileId)) : null,
    engaged: eventsAvailable && (!amId && exhibitKey || unknownEvents === 0) ? unique(engaged.map(e => e.profileId)) : null,
    sampleTapped: view.data.taps === null ? null : unique((tapped || []).map(t => {
      const client = view.data.followups.find(f => identity(f.id) === identity(t.brandId))?.clientId;
      return client ? view.canonical(client) : null;
    })),
    activity: { email: sends("Email"), whatsapp: sends("WhatsApp"), sms: sends("SMS"), linkedin: sends("LinkedIn"), calls,
      omniReachSends: view.data.tasks === null || view.data.communications === null || unknownOmniReachSendAttribution ? null : omniReachSends,
      sendMessageSends: view.data.tasks === null || view.data.communications === null || unknownSendMessageAttribution ? null : sendMessageSends,
      runs: view.data.tasks === null || unknownRuns ? null : runs },
    unknownEvents,
  };
}
