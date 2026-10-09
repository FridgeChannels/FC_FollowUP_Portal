import { safeSourceUrl, type SignalEvent } from "./model.ts";
export function notificationSignal(row: {
  type: string;
  body: string | null;
  dedupe_key: string;
  brand_id: string;
  title: string;
  created_at: string;
}): SignalEvent | null {
  if (
    !["email.opened", "linkedin.updated"].includes(row.type) ||
    !row.dedupe_key ||
    !row.brand_id ||
    !Number.isFinite(Date.parse(row.created_at))
  )
    return null;
  let meta: Record<string, unknown>;
  try {
    const body = JSON.parse(row.body || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    meta = body;
  } catch {
    return null;
  }
  const string = (key: string) =>
    typeof meta[key] === "string" ? (meta[key] as string) : undefined;
  const sourceUrl = safeSourceUrl(string("sourceUrl"));
  const publishedAt = string("publishedAt");
  if (
    row.type === "linkedin.updated" &&
    (meta.relevant !== true ||
      !sourceUrl ||
      !publishedAt ||
      !Number.isFinite(Date.parse(publishedAt)))
  )
    return null;
  const occurredAt = string("occurredAt") || row.created_at;
  if (!Number.isFinite(Date.parse(occurredAt))) return null;
  return {
    id: `${row.type}:${row.dedupe_key}`,
    brandId: row.brand_id,
    contactId: string("contactId"),
    type: row.type === "email.opened" ? "email" : "linkedin",
    summary: row.title,
    occurredAt,
    detectedAt: row.created_at,
    sourceUrl,
    evidence: string("evidence"),
    subject:
      row.type === "email.opened"
        ? string("subject") || "Subject unavailable"
        : undefined,
    publishedAt,
    highPriority: meta.highPriority === true,
  };
}
