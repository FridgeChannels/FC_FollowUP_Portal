import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot, metrics, ownerAt, stageFor, queryRange, type SourceData, type Communication } from "./data.ts";
import type { FollowupRound } from "../followup-history.ts";

const round = (patch: Partial<FollowupRound> = {}): FollowupRound => ({
  id: "r1", brand_id: "f1", round_number: 1, status: "Active",
  assigned_am_id: "am2", assigned_am_name: "Second AM", origin_encounter_id: null,
  current_cp: "cp3-id", started_at: "2026-10-01T00:00:00Z",
  paused_at: null, completed_at: null, paused_reason: null, outcome: null, migrated: false,
  created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-12T00:00:00Z", ...patch,
});
const communication = (patch: Partial<Communication> = {}): Communication => ({
  id: "c1", brandId: "f1", roundId: "r1", taskId: null, contactId: "person1", threadId: "thread1",
  messageId: null, channel: "Email", direction: "Outbound", at: "2026-10-02T12:00:00Z",
  hasContent: true, callResult: null, ...patch,
});
const data = (patch: Partial<SourceData> = {}): SourceData => ({
  loadedAt: "2026-10-14T00:00:00Z",
  brands: [
    { id: "brand1", name: "Brand", createdAt: "2026-09-01T00:00:00Z", masterId: null, exhibitions: ["expo1"] },
    { id: "duplicate", name: "Alias", createdAt: "2026-09-02T00:00:00Z", masterId: "brand1", exhibitions: ["expo1"] },
  ],
  followups: [{ id: "f1", clientId: "brand1", name: "Brand", createdAt: "2026-09-01T00:00:00Z", sourceExhibitionId: "expo1", cp: "cp3-id", ownerId: "am2", ownerName: "Second AM" }],
  exhibitions: [{ id: "expo1", name: "Exhibition" }], owners: [{ id: "am1", name: "First AM" }, { id: "am2", name: "Second AM" }],
  checkpoints: [{ id: "cp3-id", name: "CP3", definition: "CP3" }],
  rounds: [round()], encounters: [],
  assignments: [{ id: "a1", round_id: "r1", previous_am_id: "am1", previous_am_name: "First AM", new_am_id: "am2", new_am_name: "Second AM", changed_by: "Admin", changed_at: "2026-10-10T00:00:00Z" }],
  communications: [communication(), communication({ id: "c2", direction: "Inbound", at: "2026-10-03T12:00:00Z" })],
  tasks: [], taps: [], unavailable: [], ...patch,
});
const range = { start: "2026-10-01", end: "2026-10-14" };

test("brands use canonical Client identity; identical names do not collapse unrelated brands", () => {
  const input = data();
  input.brands.push({ id: "different", name: "Brand", createdAt: "2026-09-01T00:00:00Z", masterId: null, exhibitions: ["expo1"] });
  input.followups.push({ ...input.followups[0], id: "f2", clientId: "different" });
  const view = snapshot(input, range);
  assert.equal(view.totalBrands, 2);
  assert.equal(metrics(view, undefined, "expo1").brands, 2);
});
test("performance excludes untracked catalog profiles and counts the 203 non-test Follow-up brands", () => {
  const input = data({ brands: [], followups: [], rounds: [], assignments: [] });
  for (let i = 0; i < 1203; i++) {
    input.brands.push({ id: "brand" + i, name: "Brand " + i, createdAt: "2026-09-01T00:00:00Z", masterId: null, exhibitions: [i < 203 ? "expo1" : "unrelated-expo"] });
    if (i < 203) input.followups.push({ id: "f" + i, clientId: "brand" + i, name: "Brand " + i, createdAt: "2026-09-01T00:00:00Z", sourceExhibitionId: "expo1", cp: null, ownerId: null, ownerName: null });
  }
  const view = snapshot(input, range);
  assert.equal(view.totalBrands, 203);
  assert.equal(metrics(view, undefined, "expo1").brands, 203);
  assert.equal(view.exhibitBrands.has("unrelatedexpo"), false);
  assert.equal(view.opportunities.length, 203);
});
test("master profiles resolve identity without adding brands outside Follow-up", () => {
  const input = data();
  input.followups[0].clientId = "duplicate";
  const view = snapshot(input, range);
  assert.equal(view.totalBrands, 1);
  assert.equal(metrics(view, undefined, "expo1").brands, 1);
});
test("acquisition cutoff uses real dates", () => {
  assert.equal(snapshot(data(), { start: "2026-08-01", end: "2026-08-30" }).totalBrands, 0);
  // September 1 at midnight UTC is still August 31 in Eastern time.
  assert.equal(snapshot(data(), { start: "2026-08-01", end: "2026-08-31" }).totalBrands, 1);
});
test("AM transfers preserve historical communication attribution", () => {
  const view = snapshot(data(), range);
  assert.equal(metrics(view, "am1").replied, 1);
  assert.equal(metrics(view, "am1").activity.email, 1);
  assert.equal(metrics(view, "am2").replied, 0);
  assert.equal(metrics(view, "am2").assigned, 1);
  assert.equal(metrics(view, "am1").assigned, 0);
});
test("historical CP is unknown instead of projected backwards from current CP", () => {
  const view = snapshot(data(), { start: "2026-10-01", end: "2026-10-05" });
  assert.equal(view.opportunities[0].cp, null);
  assert.equal(view.opportunities[0].ownerId, "am1");
  assert.equal(metrics(view, "am1").unknownCP, 1);
});
test("all checkpoint stages are exclusive, including stages after CP3", () => {
  const input = data({ rounds: [round({ current_cp: "CP5" })] });
  assert.equal(stageFor(input, null), "CP0");
  const result = metrics(snapshot(input, range), "am2");
  assert.equal(result.cp.CP5, 1);
  assert.equal(Object.values(result.cp).reduce((sum, n) => sum! + (n || 0), 0), 1);
});
test("multiple Rounds are separate opportunities and never copy a brand's current source", () => {
  const input = data({ rounds: [round({ id: "r1", status: "Completed" }), round({ id: "r2", round_number: 2 })] });
  const view = snapshot(input, range);
  assert.equal(view.totalBrands, 1);
  assert.equal(view.opportunities.length, 2);
  assert.deepEqual(view.opportunities.map(r => r.sourceId), [null, null]);
  assert.equal(metrics(view, "am2").assigned, 1);
});
test("CP distribution counts each AM brand once using its latest active Round", () => {
  const input = data({
    checkpoints: [
      { id: "cp1-id", name: "CP1", definition: "CP1" },
      { id: "cp2-id", name: "CP2", definition: "CP2" },
      { id: "cp3-id", name: "CP3", definition: "CP3" },
    ],
    rounds: [round({ id: "r1", round_number: 1, current_cp: "cp1-id" }), round({ id: "r2", round_number: 2, current_cp: "cp2-id" })],
    assignments: [],
  });
  const result = metrics(snapshot(input, range), "am2");
  assert.equal(result.cp.CP1, 0);
  assert.equal(result.cp.CP2, 1);
  assert.equal(result.cp.CP3, 0);
  assert.equal(result.cpTotal, 1);
  assert.equal(result.assignedBrands, 1);
  assert.equal(result.assigned, 2);
  assert.equal(result.brandRounds.length, 1);
});
test("repeat encounters do not duplicate primary Round attribution", () => {
  const input = data({ rounds: [round({ origin_encounter_id: "e1" })], encounters: [
    { id: "e1", brand_id: "f1", exhibition_id: "expo1", exhibition_name: "Exhibition", round_id: "r1", meeting_at: "2026-10-01T00:00:00Z", met_by: "Staff", meeting_notes: "", key_changes: [], next_step: null, meeting_record_url: null, created_at: "2026-10-01T00:00:00Z" },
    { id: "e2", brand_id: "f1", exhibition_id: "expo2", exhibition_name: "Repeat", round_id: "r1", meeting_at: "2026-10-04T00:00:00Z", met_by: "Staff", meeting_notes: "", key_changes: [], next_step: null, meeting_record_url: null, created_at: "2026-10-04T00:00:00Z" },
  ] });
  const view = snapshot(input, range);
  assert.equal(metrics(view, undefined, "expo1").cp.CP3, 1);
  assert.equal(metrics(view, undefined, "expo2").cp.CP3, 0);
  assert.equal(view.exhibitBrands.get("expo2")?.size, 1);
});
test("scheduled records without an actual Interaction At are not sends", () => {
  const input = data({ communications: [communication({ at: null })] });
  assert.equal(metrics(snapshot(input, range), "am1").activity.email, 0);
});
test("an established thread's later two-way interaction still counts during the selected period", () => {
  const input = data();
  input.communications!.push(communication({ id: "later", direction: "Inbound", at: "2026-10-13T00:00:00Z" }));
  assert.equal(metrics(snapshot(input, { start: "2026-10-12", end: "2026-10-14" }), "am2").engaged, 1);
});
test("duplicate provider message IDs count only once", () => {
  const input = data({ communications: [communication({ messageId: "provider1" }), communication({ id: "c2", messageId: "provider1" })] });
  assert.equal(metrics(snapshot(input, range), "am1").activity.email, 1);
});
test("legacy communications without Round stamps use the brand Owner at the current cutoff", () => {
  const input = data({ communications: [communication({ roundId: null })] });
  const view = snapshot(input, range);
  assert.equal(metrics(view, "am2").activity.email, 1);
  assert.equal(metrics(view, "am1").activity.email, 0);
  assert.equal(metrics(snapshot(input, { start: "2026-10-01", end: "2026-10-05" }), "am2").activity.email, null);
});
test("existing unsaved Follow-up records contribute current CP without fabricated Round IDs", () => {
  const input = data({ rounds: [], assignments: [] });
  const view = snapshot(input, range);
  assert.equal(view.recordedRounds.length, 0);
  assert.equal(view.opportunities[0].id, "f1");
  assert.equal(view.opportunities[0].recordType, "followup");
  assert.equal(view.opportunities[0].roundNumber, 0);
  assert.equal(metrics(view, "am2").cp.CP3, 1);
});
test("unsaved current Follow-up records do not invent historical CP or AM ownership", () => {
  const view = snapshot(data({ rounds: [], assignments: [] }), { start: "2026-10-01", end: "2026-10-05" });
  assert.equal(view.opportunities[0].cp, null);
  assert.equal(view.opportunities[0].ownerId, null);
  assert.equal(metrics(view, "am2").assigned, null);
  assert.equal(metrics(view, undefined, "expo1").brands, null);
  assert.equal(metrics(view, undefined, "expo1").cp.CP3, null);
});
test("legacy brand Owner fallback attributes sends and calls independently by channel", () => {
  const input = data({ communications: [communication({ roundId: null }), communication({ id: "call", channel: "Phone", callResult: "Connected", at: "2026-10-03T12:00:00Z" })] });
  assert.equal(metrics(snapshot(input, range), "am2").activity.email, 1);
  assert.equal(metrics(snapshot(input, range), "am1").activity.calls, 1);
});
test("Caller Calls counts phone records with a result for the responsible AM's brands", () => {
  const input = data({ communications: [
    communication({ id: "outbound-call", channel: "Phone", callResult: "No Answer" }),
    communication({ id: "inbound-call", channel: "Phone", direction: "Inbound", callResult: "Connected" }),
  ] });
  assert.equal(metrics(snapshot(input, range), "am1").activity.calls, 2);
  assert.equal(metrics(snapshot(input, range), "am2").activity.calls, 0);
});
test("failed providers yield unavailable metrics rather than zero", () => {
  const input = data({ rounds: null, assignments: null, communications: null, tasks: null, taps: null });
  const result = metrics(snapshot(input, range), "am2", "expo1");
  assert.equal(result.assigned, null);
  assert.equal(result.cp.CP3, null);
  assert.equal(result.replied, null);
  assert.equal(result.activity.email, null);
  assert.equal(result.sampleTapped, null);
});
test("saved task Round attribution can resolve a linked communication", () => {
  const input = data({ communications: [communication({ roundId: null, taskId: "t1" })], tasks: [{ id: "t1", brandId: "f1", roundId: "r1", runId: "run1", createdAt: "2026-10-02T00:00:00Z", status: "Completed", endedAt: "2026-10-02T12:00:00Z" }] });
  assert.equal(metrics(snapshot(input, range), "am1").activity.email, 1);
  assert.equal(metrics(snapshot(input, range), "am1").activity.runs, 1);
});
test("OmniReach Runs deduplicates Run IDs and attributes the launch to the first task Owner", () => {
  const input = data({ tasks: [
    { id: "run-first", brandId: "f1", roundId: null, runId: "one-run", createdAt: "2026-10-02T08:00:00Z", status: "Pending", endedAt: null, ownerId: "am1" },
    { id: "run-second", brandId: "f1", roundId: null, runId: "one-run", createdAt: "2026-10-02T08:05:00Z", status: "Pending", endedAt: null, ownerId: "am2" },
    { id: "out-of-period", brandId: "f1", roundId: null, runId: "later-run", createdAt: "2026-09-30T08:00:00Z", status: "Pending", endedAt: null, ownerId: "am1" },
  ] });
  const view = snapshot(input, range);
  assert.equal(metrics(view, "am1").activity.runs, 1);
  assert.equal(metrics(view, "am2").activity.runs, 0);
  assert.equal(metrics(view, "am1", "expo1").activity.runs, 1);
});
test("Send Message Sends counts marked tasks only when an actual linked outbound exists", () => {
  const marker = "人工发送消息，尚未实际发送。\n[PERFORMANCE_SEND_MESSAGE]";
  const input = data({
    communications: [
      communication({ id: "sent1", taskId: "send1", roundId: null, at: "2026-10-04T12:00:00Z" }),
      communication({ id: "sent1-duplicate", taskId: "send1", roundId: null, at: "2026-10-04T12:01:00Z" }),
      communication({ id: "legacy-sent", taskId: "legacy-send", roundId: null, at: "2026-10-05T12:00:00Z" }),
      communication({ id: "executed-pending-status", taskId: "executed-pending", roundId: null, at: "2026-10-06T12:00:00Z" }),
      communication({ id: "queued", taskId: "send2", roundId: null, at: null }),
      communication({ id: "manual", taskId: "send3", roundId: null, at: "2026-10-04T12:00:00Z" }),
      communication({ id: "unmarked", taskId: "other", roundId: null, at: "2026-10-04T12:00:00Z" }),
    ],
    tasks: [
      { id: "send1", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-02T00:00:00Z", status: "Completed", endedAt: "2026-10-04T12:02:00Z", ownerId: "am1", notes: marker },
      { id: "legacy-send", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-02T00:00:00Z", status: "Completed", endedAt: "2026-10-05T12:02:00Z", ownerId: "am1", notes: "人工追加回复，尚未实际发送。" },
      { id: "executed-pending", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-02T00:00:00Z", status: "Pending", endedAt: null, ownerId: "am1", notes: marker },
      { id: "send2", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-03T00:00:00Z", status: "Pending", endedAt: null, ownerId: "am1", notes: marker },
      { id: "send3", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-03T00:00:00Z", status: "Completed", endedAt: "2026-10-04T12:02:00Z", ownerId: "am1", notes: "人工结束任务。" },
      { id: "other", brandId: "f1", roundId: null, runId: null, createdAt: "2026-10-03T00:00:00Z", status: "Completed", endedAt: "2026-10-04T12:02:00Z", ownerId: "am1", notes: "普通任务" },
    ],
  });
  const view = snapshot(input, range);
  assert.equal(metrics(view, "am1").activity.sendMessageSends, 3);
  assert.equal(metrics(view, "am2").activity.sendMessageSends, 0);
  assert.equal(metrics(view, "am1", "expo1").activity.sendMessageSends, 3);
  assert.equal(metrics(view, "am1", "other-exhibition").activity.sendMessageSends, 0);
  assert.equal(metrics(view, "am1").activity.omniReachSends, 0);
});
test("OmniReach Sends counts only actually sent tasks with a Run ID", () => {
  const input = data({
    tasks: [
      { id: "omni-task", brandId: "f1", roundId: "r1", runId: "run-1", createdAt: "2026-10-02T00:00:00Z", status: "Completed", endedAt: "2026-10-03T12:00:00Z", ownerId: "am1" },
      { id: "manual-task", brandId: "f1", roundId: "r1", runId: null, createdAt: "2026-10-02T00:00:00Z", status: "Completed", endedAt: "2026-10-03T12:00:00Z", ownerId: "am1", notes: "人工发送消息，尚未实际发送。\n[PERFORMANCE_SEND_MESSAGE]" },
    ],
    communications: [
      communication({ id: "omni-message", taskId: "omni-task", at: "2026-10-03T12:00:00Z" }),
      communication({ id: "manual-message", taskId: "manual-task", at: "2026-10-03T12:00:00Z" }),
    ],
  });
  const result = metrics(snapshot(input, range), "am1");
  assert.equal(result.activity.omniReachSends, 1);
  assert.equal(result.activity.sendMessageSends, 1);
});
test("unknown initial assignment is not claimed when assignment provider fails", () => {
  assert.equal(ownerAt(data({ assignments: null }), round(), Date.now()), null);
});
test("custom and preset dates are carried through route query", () => {
  assert.deepEqual(queryRange(new URLSearchParams("range=custom&start=2026-10-01&end=2026-10-05")).range, { start: "2026-10-01", end: "2026-10-05" });
});
