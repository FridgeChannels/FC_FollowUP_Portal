import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateLinkedInSamePersonGate,
  resolveLinkedInOutreachKind,
  senderIsLinkedInConnected,
} from "./gate.ts";
import {
  appendLinkedInGateNote,
  formatLinkedInGateNote,
  isLinkedInColdCapacityTask,
  parseLinkedInGateNote,
} from "./notes.ts";

describe("linkedin notes", () => {
  it("round-trips gate metadata", () => {
    const line = formatLinkedInGateNote({
      outreachKind: "cold",
      senderAccount: "Paula LIU",
      countsAgainstQuota: true,
    });
    assert.equal(
      line,
      "[LI_GATE] outreachKind=cold;senderAccount=Paula LIU;countsAgainstQuota=1",
    );
    assert.deepEqual(parseLinkedInGateNote(`人工发送\n${line}`), {
      outreachKind: "cold",
      senderAccount: "Paula LIU",
      countsAgainstQuota: true,
    });
  });

  it("replaces an existing gate line", () => {
    const notes = appendLinkedInGateNote(
      "hello\n[LI_GATE] outreachKind=cold;senderAccount=Billy HAO;countsAgainstQuota=1",
      {
        outreachKind: "followup_after_reply",
        senderAccount: "Paula LIU",
        countsAgainstQuota: false,
      },
    );
    assert.match(notes, /followup_after_reply/);
    assert.doesNotMatch(notes, /Billy HAO/);
  });

  it("treats unmarked LinkedIn as cold capacity", () => {
    assert.equal(
      isLinkedInColdCapacityTask({ channel: "LinkedIn", status: "Pending", notes: null }),
      true,
    );
    assert.equal(
      isLinkedInColdCapacityTask({
        channel: "LinkedIn",
        status: "Pending",
        notes: formatLinkedInGateNote({
          outreachKind: "followup_after_reply",
          senderAccount: "Paula LIU",
          countsAgainstQuota: false,
        }),
      }),
      false,
    );
  });

  it("does not count connected LinkedIn against cold capacity", () => {
    const notes = formatLinkedInGateNote({
      outreachKind: "connected",
      senderAccount: "Paula LIU",
      countsAgainstQuota: false,
    });
    assert.deepEqual(parseLinkedInGateNote(notes), {
      outreachKind: "connected",
      senderAccount: "Paula LIU",
      countsAgainstQuota: false,
    });
    assert.equal(
      isLinkedInColdCapacityTask({ channel: "LinkedIn", status: "Pending", notes }),
      false,
    );
  });
});

describe("linkedin same-person gate", () => {
  it("blocks second cold before inbound reply", () => {
    const result = evaluateLinkedInSamePersonGate({
      outreachKind: "cold",
      tasks: [{
        channel: "LinkedIn",
        status: "Completed",
        notes: "[LI_GATE] outreachKind=cold;senderAccount=Paula LIU;countsAgainstQuota=1",
      }],
      activities: [],
    });
    assert.equal(result.ok, false);
  });

  it("allows followup after inbound", () => {
    assert.equal(
      resolveLinkedInOutreachKind({
        activities: [{ channel: "LinkedIn", direction: "Inbound" }],
      }),
      "followup_after_reply",
    );
    const result = evaluateLinkedInSamePersonGate({
      outreachKind: "followup_after_reply",
      tasks: [{
        channel: "LinkedIn",
        status: "Completed",
        notes: "[LI_GATE] outreachKind=cold;senderAccount=Paula LIU;countsAgainstQuota=1",
      }],
      activities: [{ channel: "LinkedIn", direction: "Inbound" }],
    });
    assert.equal(result.ok, true);
  });

  it("allows followup after inbound even when an open LinkedIn task exists", () => {
    const result = evaluateLinkedInSamePersonGate({
      outreachKind: "followup_after_reply",
      tasks: [{
        channel: "LinkedIn",
        status: "In Progress",
        notes: "[LI_GATE] outreachKind=cold;senderAccount=Paula LIU;countsAgainstQuota=1",
      }],
      activities: [{ channel: "LinkedIn", direction: "Inbound" }],
    });
    assert.equal(result.ok, true);
  });

  it("blocks when an open LinkedIn task exists", () => {
    const result = evaluateLinkedInSamePersonGate({
      outreachKind: "cold",
      tasks: [{ channel: "LinkedIn", status: "Pending", notes: null }],
      activities: [],
    });
    assert.equal(result.ok, false);
  });

  it("allows connected outreach even with unreplied cold history", () => {
    const result = evaluateLinkedInSamePersonGate({
      outreachKind: "connected",
      tasks: [{
        channel: "LinkedIn",
        status: "Completed",
        notes: "[LI_GATE] outreachKind=cold;senderAccount=Paula LIU;countsAgainstQuota=1",
      }],
      activities: [],
    });
    assert.equal(result.ok, true);
  });
});

describe("linkedin connected outreach kind", () => {
  it("matches sender against LinkedIn Connected names", () => {
    assert.equal(senderIsLinkedInConnected("Paula LIU", ["Billy HAO", "Paula LIU"]), true);
    assert.equal(senderIsLinkedInConnected("paula liu", ["Paula LIU"]), true);
    assert.equal(senderIsLinkedInConnected("Paula LIU", ["Billy HAO"]), false);
    assert.equal(senderIsLinkedInConnected("Paula LIU", []), false);
  });

  it("uses connected when active sender is listed and there is no inbound", () => {
    assert.equal(
      resolveLinkedInOutreachKind({
        activities: [],
        senderAccount: "Paula LIU",
        connectedAccounts: ["Paula LIU"],
      }),
      "connected",
    );
  });

  it("stays cold when only another account is connected", () => {
    assert.equal(
      resolveLinkedInOutreachKind({
        activities: [],
        senderAccount: "Paula LIU",
        connectedAccounts: ["Billy HAO"],
      }),
      "cold",
    );
  });

  it("prefers inbound followup over connected", () => {
    assert.equal(
      resolveLinkedInOutreachKind({
        activities: [{ channel: "LinkedIn", direction: "Inbound" }],
        senderAccount: "Paula LIU",
        connectedAccounts: ["Paula LIU"],
      }),
      "followup_after_reply",
    );
  });
});
