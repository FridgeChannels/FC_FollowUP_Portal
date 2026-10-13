export type RoundStatus = "Active" | "Paused" | "Completed";
export const KEY_CHANGE_TYPES = ["Contact", "Interest", "Objection", "Commitment", "Outcome"] as const;
export type KeyChange = { type: typeof KEY_CHANGE_TYPES[number]; text: string; source: string };
export type FollowupRound = {
  id: string; brand_id: string; round_number: number; status: RoundStatus;
  assigned_am_id: string | null; assigned_am_name: string | null;
  origin_encounter_id: string | null; current_cp: string | null;
  started_at: string | null; paused_at: string | null; completed_at: string | null;
  paused_reason: string | null; outcome: string | null; migrated: boolean;
  created_at: string; updated_at: string;
};
export type ExhibitionEncounter = {
  id: string; brand_id: string; exhibition_id: string; exhibition_name: string;
  round_id: string | null; meeting_at: string; met_by: string; meeting_notes: string;
  key_changes: KeyChange[]; next_step: string | null; meeting_record_url: string | null; created_at: string;
};
export type RoundAssignment = {
  id: string; round_id: string; previous_am_id: string | null; previous_am_name: string | null;
  new_am_id: string | null; new_am_name: string | null; changed_by: string; changed_at: string;
};
export type FollowupHistory = {
  relationshipSummary?: string | null;
  version: number; projectionPending: boolean; rounds: FollowupRound[];
  encounters: ExhibitionEncounter[]; assignments: RoundAssignment[];
  unreadEncounterCount?: number; unavailable?: string; duplicate?: boolean;
};
export type EncounterInput = {
  id: string; exhibitionId: string; exhibitionName?: string; meetingAt: string; metBy: string;
  meetingNotes: string; keyChanges: KeyChange[]; nextStep: string | null;
  meetingRecordUrl: string | null; historical: boolean;
};
export class FollowupError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function textField(value: unknown, name: string, max: number, required = false): string {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > max || required && !value.trim()) {
    throw new FollowupError(`Enter a valid ${name} (maximum ${max} characters)`);
  }
  return value.trim();
}
export function parseEncounter(value: unknown): EncounterInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FollowupError("Invalid Encounter");
  const input = value as Record<string, unknown>;
  const id = textField(input.id, "stable Encounter ID", 200, true);
  const meetingAt = textField(input.meetingAt, "Meeting Date", 50, true);
  if (!Number.isFinite(Date.parse(meetingAt)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(meetingAt)
    || new Date(`${meetingAt.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) !== meetingAt.slice(0,10)) {
    throw new FollowupError("Meeting Date must include a timezone");
  }
  const rawChanges = input.keyChanges ?? [];
  if (!Array.isArray(rawChanges) || rawChanges.length > 20) throw new FollowupError("Invalid Key Changes");
  const keyChanges = rawChanges.map((raw): KeyChange => {
    if (!raw || typeof raw !== "object" || !KEY_CHANGE_TYPES.includes(raw.type)) throw new FollowupError("Invalid Key Change type");
    return { type: raw.type, text: textField(raw.text, "Key Change", 2000, true), source: textField(raw.source ?? id, "Key Change source", 2000, true) };
  });
  const meetingRecordUrl = textField(input.meetingRecordUrl, "Meeting Record URL", 2000);
  if (meetingRecordUrl) {
    try { if (new URL(meetingRecordUrl).protocol !== "https:") throw new Error(); }
    catch { throw new FollowupError("Meeting Record URL must use HTTPS"); }
  }
  if (input.historical != null && typeof input.historical !== "boolean") throw new FollowupError("Invalid historical flag");
  return {
    id, exhibitionId: textField(input.exhibitionId, "Exhibition ID", 200, true),
    meetingAt: new Date(meetingAt).toISOString(), metBy: textField(input.metBy, "Met By", 500, true),
    // Preserve the original notes exactly; they are evidence, not display copy.
    meetingNotes: typeof input.meetingNotes === "string" && input.meetingNotes.length <= 50000 ? input.meetingNotes : (() => { throw new FollowupError("Invalid Meeting Notes"); })(),
    keyChanges, nextStep: textField(input.nextStep, "Next Step", 3000) || null,
    meetingRecordUrl: meetingRecordUrl || null, historical: input.historical === true,
  };
}
export function emptyFollowupHistory(unavailable?: string): FollowupHistory {
  return { version: 0, projectionPending: false, rounds: [], encounters: [], assignments: [], ...(unavailable ? { unavailable } : {}) };
}
export function hasFollowupHistory(history: FollowupHistory | undefined, legacyMeetingCount = 0, legacyAssignmentCount = 0) {
  return !!history && (history.rounds.length > 1 || history.rounds.some(r => r.status === "Completed") || history.encounters.length > 1 || history.encounters.some(e => !e.round_id || e.key_changes.length > 0) || history.assignments.length > 0 || !!history.unreadEncounterCount)
    || legacyMeetingCount > 1 || legacyAssignmentCount > 1;
}
/** Only explicit stamps establish attribution; never infer a Round from dates. */
export function communicationRoundId(value?: string | null): string | null {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed.followupRoundId === "string" ? parsed.followupRoundId : null;
  } catch { return null; }
}
export function stampCommunicationRound(value: string | null | undefined, roundId: string | null) {
  if (!roundId) return value || "";
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(value || "{}"); }
  catch { return value || ""; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value || "";
  return JSON.stringify({ ...parsed, followupRoundId: communicationRoundId(value) || roundId });
}
const TASK_ROUND_MARKER = "[FOLLOWUP_ROUND]";
export function taskRoundId(notes?: string | null) {
  const line = (notes || "").split("\n").find(l => l.startsWith(TASK_ROUND_MARKER));
  return line?.slice(TASK_ROUND_MARKER.length).trim() || null;
}
export function stampTaskRound(notes: string, roundId: string) {
  return taskRoundId(notes) ? notes : [notes, `${TASK_ROUND_MARKER}${roundId}`].filter(Boolean).join("\n");
}
export function withoutTaskRound(notes: string) {
  return notes.split("\n").filter(l => !l.startsWith(TASK_ROUND_MARKER)).join("\n");
}
/** Notion writes use text.content; API reads use plain_text. */
export function notionWriteText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const property = value as { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> };
  return (property.rich_text || []).map(item => item.plain_text ?? item.text?.content ?? "").join("");
}
/** Source-aware context supplements the saved summary without overwriting it. */
export function encounterKeyContext(history?: FollowupHistory): string {
  if (!history) return "";
  return history.encounters.flatMap(e => e.key_changes.map(c => `${c.type}: ${c.text} [${e.exhibition_name} · ${e.meeting_at.slice(0,10)} · Source: ${c.source}]`)).join("\n");
}
