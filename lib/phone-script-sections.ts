export const PHONE_SCRIPT_SECTIONS = [
  {
    key: "context",
    label: "1. Context",
    placeholder: "Why are we calling now? What happened before? Note known attitudes, concerns, and facts still to confirm.",
    required: true,
  },
  {
    key: "goal",
    label: "2. Goal & Success Criteria",
    placeholder: "State the primary goal, the information or agreement that defines success, and an acceptable fallback goal if needed.",
    required: true,
  },
  {
    key: "businessBranches",
    label: "3. Business Branches",
    placeholder: "List only customer- or goal-specific situations and the matching way to move forward.",
    required: false,
  },
  {
    key: "specialFacts",
    label: "4. Special Facts, Authority & Red Lines",
    placeholder: "Note customer-specific pricing, options, and authorized commitments; what must not be said or done; and what must return to AM. If none, write “Follow standard rules; no extra authorization.”",
    required: true,
  },
  {
    key: "nextStep",
    label: "5. Next Step & Handoff",
    placeholder: "Describe who owns each outcome after the call, what Caller can arrange directly, and what needs AM’s decision.",
    required: true,
  },
] as const;

export type PhoneScriptSectionKey = (typeof PHONE_SCRIPT_SECTIONS)[number]["key"];
export type PhoneScriptSections = Record<PhoneScriptSectionKey, string>;

const LEGACY_PHONE_SCRIPT_LABELS: Record<string, PhoneScriptSectionKey> = {
  "1. Context｜本次背景": "context",
  "2. Goal & Success Criteria｜目标与完成标准": "goal",
  "3. Business Branches｜业务分支": "businessBranches",
  "4. Special Facts, Authority & Red Lines｜本次特殊信息、授权与禁区": "specialFacts",
  "5. Next Step & Handoff｜后续动作与交接": "nextStep",
};

function emptySections(): PhoneScriptSections {
  return {
    context: "",
    goal: "",
    businessBranches: "",
    specialFacts: "",
    nextStep: "",
  };
}

/**
 * Reads the stable, heading-based phone-script format. Existing freeform scripts
 * remain editable by treating their text as the call context.
 */
export function parsePhoneScriptSections(script?: string | null): PhoneScriptSections {
  const source = script?.trim() || "";
  if (!source) return emptySections();

  const matches = [...source.matchAll(/^## ([^\n]+)\s*$/gm)];
  const known = new Map<string, PhoneScriptSectionKey>(
    [
      ...PHONE_SCRIPT_SECTIONS.map((section) => [section.label, section.key] as const),
      ...Object.entries(LEGACY_PHONE_SCRIPT_LABELS),
    ],
  );
  const recognized = matches.filter((match) => known.has(match[1]));
  if (!recognized.length) return { ...emptySections(), context: source };

  const result = emptySections();
  for (let index = 0; index < recognized.length; index += 1) {
    const match = recognized[index];
    const key = known.get(match[1]);
    if (!key || match.index === undefined) continue;
    const next = recognized[index + 1];
    const contentStart = match.index + match[0].length;
    const contentEnd = next?.index ?? source.length;
    result[key] = source.slice(contentStart, contentEnd).trim();
  }
  return result;
}

export function formatPhoneScriptSections(sections: PhoneScriptSections) {
  return PHONE_SCRIPT_SECTIONS
    .map((section) => `## ${section.label}\n${sections[section.key].trim()}`)
    .join("\n\n")
    .trim();
}

export function phoneScriptSectionsComplete(sections: PhoneScriptSections) {
  return PHONE_SCRIPT_SECTIONS
    .filter((section) => section.required)
    .every((section) => !!sections[section.key].trim());
}
