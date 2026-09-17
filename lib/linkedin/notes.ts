import type { LinkedInGateMeta, LinkedInOutreachKind } from "./types.ts";

const GATE_PREFIX = "[LI_GATE]";

export function formatLinkedInGateNote(meta: LinkedInGateMeta) {
  return `${GATE_PREFIX} outreachKind=${meta.outreachKind};senderAccount=${meta.senderAccount};countsAgainstQuota=${meta.countsAgainstQuota ? "1" : "0"}`;
}

export function parseLinkedInGateNote(notes?: string | null): LinkedInGateMeta | null {
  if (!notes) return null;
  const line = notes
    .split(/\n/)
    .map((item) => item.trim())
    .find((item) => item.startsWith(GATE_PREFIX));
  if (!line) return null;
  const body = line.slice(GATE_PREFIX.length).trim();
  const parts = Object.fromEntries(
    body
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const idx = chunk.indexOf("=");
        if (idx < 0) return [chunk, ""];
        return [chunk.slice(0, idx).trim(), chunk.slice(idx + 1).trim()];
      }),
  );
  const outreachKind = parts.outreachKind as LinkedInOutreachKind | undefined;
  const senderAccount = parts.senderAccount?.trim();
  if (outreachKind !== "cold" && outreachKind !== "followup_after_reply") return null;
  if (!senderAccount) return null;
  return {
    outreachKind,
    senderAccount,
    countsAgainstQuota: parts.countsAgainstQuota === "1",
  };
}

export function appendLinkedInGateNote(notes: string | null | undefined, meta: LinkedInGateMeta) {
  const line = formatLinkedInGateNote(meta);
  const base = (notes || "").trim();
  if (!base) return line;
  if (base.includes(GATE_PREFIX)) {
    return base
      .split(/\n/)
      .map((item) => (item.trim().startsWith(GATE_PREFIX) ? line : item))
      .join("\n");
  }
  return `${base}\n${line}`;
}

export function isLinkedInColdCapacityTask(input: {
  channel?: string | null;
  status?: string | null;
  notes?: string | null;
}) {
  if (input.channel !== "LinkedIn") return false;
  if (input.status === "Cancelled") return false;
  const meta = parseLinkedInGateNote(input.notes);
  if (meta) return meta.outreachKind === "cold";
  // Legacy LinkedIn tasks without marker still occupy bandwidth.
  return true;
}
