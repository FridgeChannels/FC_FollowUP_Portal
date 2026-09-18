import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  historyFromTask,
  isCallInCurrentRound,
  mergeUnselectedCallsIntoHistory,
  nextReviewRound,
  partitionRoundCalls,
  reviewRoundsForTask,
  unusedCallIds,
  withInheritedCallIds,
  writeCallReviewHistory,
  type CallReviewRound,
} from "./call-review-history.ts";

const round = (input: Partial<CallReviewRound> & Pick<CallReviewRound, "round" | "status">): CallReviewRound => ({
  id: input.id || `review-${input.round}`,
  round: input.round,
  status: input.status,
  submittedAt: input.submittedAt,
  reviewedAt: input.reviewedAt,
  reviewerName: input.reviewerName,
  reason: input.reason,
  note: input.note,
  callerNote: input.callerNote,
  callIds: input.callIds || [],
});

describe("call review rounds", () => {
  it("increments the round after Unqualified", () => {
    assert.equal(nextReviewRound([]), 1);
    assert.equal(nextReviewRound([round({ round: 1, status: "Awaiting Review" })]), 1);
    assert.equal(nextReviewRound([round({ round: 1, status: "Unqualified" })]), 2);
  });

  it("keeps the current round expanded after a recall", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified", reason: "Need owner", note: "Ask again", reviewerName: "Beril", reviewedAt: "2026-09-22T12:00:00.000Z", callIds: ["call-1"] }),
    ]);
    assert.equal(view.current.round, 2);
    assert.equal(view.current.status, "In Progress");
    assert.equal(view.current.recalled, true);
    assert.equal(view.current.reason, undefined);
    assert.equal(view.history.length, 1);
    assert.equal(view.history[0].round, 1);
    assert.equal(view.history[0].reason, "Need owner");
  });

  it("treats Awaiting Review as the current round", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified", reason: "Need owner" }),
      round({ round: 2, status: "Awaiting Review", callerNote: "Reached owner" }),
    ]);
    assert.equal(view.current.round, 2);
    assert.equal(view.current.status, "Awaiting Review");
    assert.equal(view.current.recalled, false);
    assert.equal(view.current.callerNote, "Reached owner");
    assert.equal(view.history[0].round, 1);
  });

  it("only counts leftover calls toward the recalled current round", () => {
    const history = [round({ round: 1, status: "Unqualified", callIds: ["call-1"] })];
    const view = reviewRoundsForTask(history);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-17T00:00:00.000Z" },
        { id: "call-2", at: "2026-09-18T00:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.history[0]?.calls.map((item) => item.id), ["call-1"]);
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-2"]);
    assert.deepEqual(unusedCallIds(history, ["call-1", "call-2"]), ["call-2"]);
  });

  it("assigns leftover calls to the current in-progress round", () => {
    const view = reviewRoundsForTask([round({ round: 1, status: "Unqualified", callIds: ["call-1"] })]);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-17T00:00:00.000Z" },
        { id: "call-2", at: "2026-09-18T00:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.history[0]?.calls.map((item) => item.id), ["call-1"]);
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-2"]);
  });

  it("keeps leftover calls off a submitted round so AccountManager only sees the selected call", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified", callIds: ["call-1"] }),
      round({ round: 2, status: "Awaiting Review", callIds: ["call-2"] }),
    ]);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-17T00:00:00.000Z" },
        { id: "call-2", at: "2026-09-18T00:00:00.000Z" },
        { id: "call-3", at: "2026-09-18T01:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.history[0]?.calls.map((item) => item.id), ["call-1", "call-3"]);
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-2"]);
  });

  it("moves leftover pre-recall calls into Earlier calls instead of the new current round", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified", callIds: ["call-1"] }),
      round({
        round: 3,
        status: "Unqualified",
        callIds: ["call-selected"],
        submittedAt: "2026-09-18T09:00:40.000Z",
        reviewedAt: "2026-09-18T09:09:27.000Z",
      }),
    ]);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-18T02:46:00.000Z" },
        { id: "call-unselected", at: "2026-09-18T08:54:00.000Z" },
        { id: "call-selected", at: "2026-09-18T08:57:00.000Z" },
        { id: "call-new", at: "2026-09-18T10:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-new"]);
    assert.deepEqual(
      partitioned.history.find((item) => item.round.status === "Archived")?.calls.map((item) => item.id),
      ["call-unselected"],
    );
  });

  it("shows persisted unselected calls under archived history, not the submitted round", () => {
    const archived = round({ id: "archived-1", round: 0, status: "Archived", callIds: ["call-3"] });
    const view = reviewRoundsForTask([
      archived,
      round({ round: 1, status: "Unqualified", callIds: ["call-1"] }),
      round({ round: 2, status: "Awaiting Review", callIds: ["call-2"] }),
    ]);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-17T00:00:00.000Z" },
        { id: "call-2", at: "2026-09-18T00:00:00.000Z" },
        { id: "call-3", at: "2026-09-18T01:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.equal(view.current.callIds[0], "call-2");
    assert.deepEqual(
      partitioned.history.find((item) => item.round.status === "Archived")?.calls.map((item) => item.id),
      ["call-3"],
    );
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-2"]);
  });

  it("archives unselected calls into an Earlier calls history round", () => {
    const merged = mergeUnselectedCallsIntoHistory(
      [round({ round: 1, status: "Unqualified", callIds: ["call-1"] })],
      ["call-3", "call-4"],
    );
    assert.equal(merged[0]?.status, "Archived");
    assert.deepEqual(merged[0]?.callIds, ["call-3", "call-4"]);
    assert.deepEqual(merged[1]?.callIds, ["call-1"]);
  });

  it("archives unselected calls as earlier history when there is no prior round", () => {
    const merged = mergeUnselectedCallsIntoHistory([], ["call-a", "call-b"]);
    assert.equal(merged[0]?.status, "Archived");
    assert.equal(merged[0]?.round, 0);
    assert.deepEqual(merged[0]?.callIds, ["call-a", "call-b"]);
    const view = reviewRoundsForTask([
      merged[0],
      round({ round: 1, status: "Awaiting Review", callIds: ["call-c"] }),
    ]);
    assert.equal(view.current.callIds[0], "call-c");
    assert.equal(view.history[0]?.status, "Archived");
    assert.deepEqual(view.history[0]?.callIds, ["call-a", "call-b"]);
  });

  it("puts legacy recalled calls on the closed round so history cards keep Call results", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified", reviewerName: "Peter" }),
    ]);
    const partitioned = partitionRoundCalls(
      [{ id: "call-1", at: "2026-09-17T22:46:00.000Z" }],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.history[0]?.calls.map((item) => item.id), ["call-1"]);
    assert.deepEqual(partitioned.current.map((item) => item.id), []);
  });

  it("keeps a later call cluster on the recalled current round", () => {
    const view = reviewRoundsForTask([
      round({ round: 1, status: "Unqualified" }),
    ]);
    const partitioned = partitionRoundCalls(
      [
        { id: "call-1", at: "2026-09-17T22:46:00.000Z" },
        { id: "call-2", at: "2026-09-18T16:00:00.000Z" },
      ],
      view,
      (item) => item.id,
      (item) => item.at,
    );
    assert.deepEqual(partitioned.history[0]?.calls.map((item) => item.id), ["call-1"]);
    assert.deepEqual(partitioned.current.map((item) => item.id), ["call-2"]);
  });

  it("reads legacy reason and note from Notes when history JSON is missing", () => {
    const [legacy] = historyFromTask({
      id: "task-1",
      callReviewStatus: "Unqualified",
      notes: "Unqualified reason: Need owner\nAccountManager note: Ask again",
    });
    assert.equal(legacy?.reason, "Need owner");
    assert.equal(legacy?.note, "Ask again");
  });

  it("recovers a recalled round after Call Review Status was cleared", () => {
    const [legacy] = historyFromTask({
      id: "task-1",
      notes: "通话已接通（Connected），任务进入待评审。\n通话评审 Unqualified，已召回改派给 Beril（Peter）。",
    });
    assert.equal(legacy?.status, "Unqualified");
    assert.equal(legacy?.reviewerName, "Peter");
    const view = reviewRoundsForTask(legacy ? [legacy] : []);
    assert.equal(view.current.round, 2);
    assert.equal(view.current.recalled, true);
    assert.equal(view.history[0]?.round, 1);
  });

  it("does not inherit calls onto an Unqualified round (keeps them for the next attempt)", () => {
    const inherited = withInheritedCallIds(
      [round({ round: 1, status: "Unqualified" })],
      ["call-1", "call-2"],
    );
    assert.deepEqual(inherited[0]?.callIds, []);
    assert.equal(isCallInCurrentRound("call-1", inherited), true);
    assert.equal(isCallInCurrentRound("call-2", inherited), true);
  });

  it("inherits missing callIds onto an Awaiting Review round", () => {
    const inherited = withInheritedCallIds(
      [round({ round: 1, status: "Awaiting Review" })],
      ["call-1"],
    );
    assert.deepEqual(inherited[0]?.callIds, ["call-1"]);
  });

  it("parses bracketed history markers literally and strips duplicate blocks on write", () => {
    const block = (callIds: string[]) =>
      `[CALL_REVIEW_HISTORY_V1]\n${JSON.stringify([
        round({ round: 1, status: "Unqualified", callIds }),
      ])}\n[/CALL_REVIEW_HISTORY_V1]`;
    const notes = [
      "通话评审 Unqualified，已召回改派给 Beril（Peter）。",
      block(["call-old"]),
      block(["call-old", "call-new"]),
    ].join("\n");
    const parsed = historyFromTask({ id: "t1", notes, callReviewStatus: null });
    assert.deepEqual(parsed[0]?.callIds, ["call-old"]);
    const cleaned = writeCallReviewHistory(notes, parsed);
    assert.equal((cleaned.match(/CALL_REVIEW_HISTORY_V1/g) || []).length, 2);
    assert.match(cleaned, /"call-old"/);
    assert.doesNotMatch(cleaned, /call-new/);
  });

  it("stores structured history without flattening reason into Notes", () => {
    const notes = writeCallReviewHistory("Existing brief", [
      round({ round: 1, status: "Unqualified", reason: "Need owner", note: "Ask again" }),
    ]);
    assert.match(notes, /\[CALL_REVIEW_HISTORY_V1\]/);
    assert.doesNotMatch(notes.replace(/\[CALL_REVIEW_HISTORY_V1\][\s\S]*\[\/CALL_REVIEW_HISTORY_V1\]/, ""), /Need owner/);
  });
});
