export type LinkedInFinding = {
  brandId: string;
  brandName: string;
  targetType: "brand_official" | "key_person";
  targetId: string | null;
  targetName: string;
  targetLinkedInUrl: string;
  authorName: string;
  postUrl: string;
  publishedAt: string;
  summary: string;
  evidence: string;
  relevant: true;
  priority: "normal" | "high";
};

export type LinkedInMonitoringPayload = {
  findings: LinkedInFinding[];
};

type InsertNotification = (input: {
  type: string;
  brandId: string;
  ownerId?: string | null;
  title: string;
  body?: string | null;
  deepLink?: string | null;
  dedupeKey: string;
}) => Promise<unknown | null>;

export type LinkedInIngestResult = {
  received: number;
  accepted: number;
  inserted: number;
  duplicate: number;
  rejected: Array<{ index: number; error: string }>;
};

function text(value: unknown, max = 1_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canonicalLinkedInPostUrl(value: unknown) {
  const raw = text(value, 4_000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(hostname === "linkedin.com" || hostname.endsWith(".linkedin.com"))) {
      return null;
    }
    const path = url.pathname.replace(/\/+$/, "");
    // A profile or company home cannot be used as a stable Signal source.
    if (!/(?:\/posts\/|\/feed\/update\/|\/pulse\/|\/activity-)/i.test(path)) return null;
    url.hash = "";
    url.search = "";
    url.pathname = path;
    return url.href;
  } catch {
    return null;
  }
}

function normalizeFinding(value: unknown): LinkedInFinding | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "finding must be an object";
  const source = value as Record<string, unknown>;
  const brandId = text(source.brandId, 200);
  const brandName = text(source.brandName, 300);
  const targetType = text(source.targetType, 30);
  const targetId = text(source.targetId, 200) || null;
  const targetName = text(source.targetName, 300);
  const targetLinkedInUrl = text(source.targetLinkedInUrl, 4_000);
  const authorName = text(source.authorName, 300);
  const postUrl = canonicalLinkedInPostUrl(source.postUrl);
  const publishedAt = text(source.publishedAt, 100);
  const summary = text(source.summary, 1_500);
  const evidence = text(source.evidence, 1_500);
  const priority = text(source.priority, 20);

  if (!brandId) return "brandId is required";
  if (!brandName) return "brandName is required";
  if (targetType !== "brand_official" && targetType !== "key_person") return "targetType is invalid";
  if (targetType === "key_person" && !targetId) return "targetId is required for key_person";
  if (!targetName || !targetLinkedInUrl || !authorName) return "target metadata is required";
  if (!postUrl) return "postUrl must be a direct HTTPS LinkedIn post URL";
  if (!Number.isFinite(Date.parse(publishedAt))) return "publishedAt must be an ISO date";
  if (!summary || !evidence) return "summary and evidence are required";
  if (source.relevant !== true) return "relevant must be true";
  if (priority !== "normal" && priority !== "high") return "priority is invalid";

  return {
    brandId,
    brandName,
    targetType,
    targetId,
    targetName,
    targetLinkedInUrl,
    authorName,
    postUrl,
    publishedAt: new Date(publishedAt).toISOString(),
    summary,
    evidence,
    relevant: true,
    priority,
  };
}

/** Store verified Notion AI findings in the existing Signals event source. */
export async function ingestLinkedInFindings(
  input: unknown,
  insert?: InsertNotification,
): Promise<LinkedInIngestResult> {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;
  const findings = Array.isArray(source?.findings) ? source.findings : null;
  if (!findings) throw new Error("findings must be an array");

  const result: LinkedInIngestResult = {
    received: findings.length,
    accepted: 0,
    inserted: 0,
    duplicate: 0,
    rejected: [],
  };
  // Keep parsing usable in Node unit tests; the production writer needs the
  // Cloudflare-bound Supabase module only when a real ingest is requested.
  const writer = insert || (await import("../sample/notifications.ts")).insertSystemNotification;

  for (const [index, value] of findings.entries()) {
    const finding = normalizeFinding(value);
    if (typeof finding === "string") {
      result.rejected.push({ index, error: finding });
      continue;
    }
    result.accepted += 1;
    const body = JSON.stringify({
      relevant: true,
      sourceUrl: finding.postUrl,
      publishedAt: finding.publishedAt,
      occurredAt: finding.publishedAt,
      evidence: `${finding.evidence}\nAuthor: ${finding.authorName}\nTarget: ${finding.targetName}`,
      targetType: finding.targetType,
      targetName: finding.targetName,
      targetLinkedInUrl: finding.targetLinkedInUrl,
      highPriority: finding.priority === "high",
    });
    const inserted = await writer({
      type: "linkedin.updated",
      brandId: finding.brandId,
      ownerId: null,
      title: `LinkedIn update · ${finding.summary}`,
      body,
      deepLink: `/signals?brand=${encodeURIComponent(finding.brandId)}`,
      // The same post is one Signal per Brand, even if it is found again in a later run.
      dedupeKey: `linkedin.updated:${finding.brandId}:${finding.postUrl}`,
    });
    if (inserted) result.inserted += 1;
    else result.duplicate += 1;
  }
  return result;
}
