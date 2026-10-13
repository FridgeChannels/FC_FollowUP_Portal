import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPhoneScriptSections,
  parsePhoneScriptSections,
  phoneScriptSectionsComplete,
} from "./phone-script-sections.ts";

test("formats and parses the five phone-script sections", () => {
  const sections = {
    context: "They asked for an introduction after the show.",
    goal: "Confirm the direct owner and a next conversation.",
    businessBranches: "If they are not the owner, ask for a warm handoff.",
    specialFacts: "No pricing. Escalate any delivery commitment.",
    nextStep: "Caller can book a discovery call; AM approves any proposal.",
  };
  assert.deepEqual(parsePhoneScriptSections(formatPhoneScriptSections(sections)), sections);
  assert.equal(phoneScriptSectionsComplete(sections), true);
});

test("permits an empty business branch but requires the other four sections", () => {
  const sections = {
    context: "Context",
    goal: "Goal",
    businessBranches: "",
    specialFacts: "No additional authorization.",
    nextStep: "AM follows up.",
  };
  assert.equal(phoneScriptSectionsComplete(sections), true);
  assert.equal(phoneScriptSectionsComplete({ ...sections, nextStep: "" }), false);
});

test("keeps a legacy freeform script editable as context", () => {
  assert.deepEqual(parsePhoneScriptSections("Ask whether their timeline changed."), {
    context: "Ask whether their timeline changed.",
    goal: "",
    businessBranches: "",
    specialFacts: "",
    nextStep: "",
  });
});

test("reads prior bilingual section headings but writes English-only headings", () => {
  const legacy = "## 1. Context｜本次背景\nOld context\n\n## 2. Goal & Success Criteria｜目标与完成标准\nOld goal";
  const parsed = parsePhoneScriptSections(legacy);
  assert.equal(parsed.context, "Old context");
  assert.equal(parsed.goal, "Old goal");
  assert.match(formatPhoneScriptSections(parsed), /## 1\. Context\n/);
  assert.doesNotMatch(formatPhoneScriptSections(parsed), /本次背景/);
});
