import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachBombScenario,
  findByNotionId,
  setTitleForNotionId,
  titleForNotionId,
  type BombDetail,
  type BombScenario,
} from "./bomb-list.ts";

const scenario: BombScenario = {
  id: "5379546a-3f05-458a-a9a7-f00c319dc82f",
  name: "Connector received sample but does not reply",
  description: "Connector received the Sample, but did not reply.",
};

function bomb(partial: Partial<BombDetail> = {}): BombDetail {
  return {
    id: "f40e5911-bf41-4228-af12-d55eb5f6bdf0",
    name: "OmniR|Connector received sample but does not reply",
    goal: "",
    status: "Active",
    priority: null,
    targetRole: "Connector",
    cp: "CP2",
    cpIds: [],
    scenarioId: null,
    scenarioName: null,
    channels: [],
    templateCount: 0,
    lastEditedAt: null,
    notes: null,
    createdAt: null,
    scenarioDescription: null,
    cps: [],
    templates: [],
    ...partial,
  };
}

describe("Notion scenario matching", () => {
  it("matches compact and hyphenated page IDs", () => {
    assert.equal(
      findByNotionId([scenario], "5379546a3f05458aa9a7f00c319dc82f")?.name,
      scenario.name,
    );
  });

  it("resolves titles when relation IDs omit hyphens", () => {
    const titles = new Map<string, string>();
    setTitleForNotionId(titles, scenario.id, scenario.name);
    assert.equal(titleForNotionId(titles, "5379546a3f05458aa9a7f00c319dc82f"), scenario.name);
  });

  it("fills missing scenario name from the catalog", () => {
    const attached = attachBombScenario(
      bomb({ scenarioId: "5379546a3f05458aa9a7f00c319dc82f" }),
      [scenario],
    );
    assert.equal(attached.scenarioId, scenario.id);
    assert.equal(attached.scenarioName, scenario.name);
    assert.equal(attached.scenarioDescription, scenario.description);
  });
});
