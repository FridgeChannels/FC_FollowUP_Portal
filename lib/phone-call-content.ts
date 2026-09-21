/** Structured Phone Conversation Content: caller briefing + suggested script. */

const CONTEXT_HEADER = "Context:";
const SCRIPT_HEADER = "Script:";
const SCRIPT_SPLIT = /\n\nScript:\s*\n/;

export function composePhoneCallContent(context: string, script: string) {
  const ctx = context.trim();
  const scr = script.trim();
  if (!ctx) return scr;
  if (!scr) return `${CONTEXT_HEADER}\n${ctx}`;
  return `${CONTEXT_HEADER}\n${ctx}\n\n${SCRIPT_HEADER}\n${scr}`;
}

export function parsePhoneCallContent(content: string | null | undefined): {
  context: string;
  script: string;
} {
  const text = (content || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { context: "", script: "" };
  if (!/^Context:\s*(?:\n|$)/.test(text)) {
    return { context: "", script: text };
  }

  const withoutHeader = text.replace(/^Context:\s*\n?/, "");
  const match = SCRIPT_SPLIT.exec(withoutHeader);
  if (!match) {
    return { context: withoutHeader.trim(), script: "" };
  }
  return {
    context: withoutHeader.slice(0, match.index).trim(),
    script: withoutHeader.slice(match.index + match[0].length).trim(),
  };
}
