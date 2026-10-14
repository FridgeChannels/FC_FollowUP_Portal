import assert from "node:assert/strict";
import { test } from "node:test";
import { ingestLinkedInFindings } from "./linkedin-ingest.ts";

const finding = {
  brandId: "brand-1",
  brandName: "Northstar",
  targetType: "key_person",
  targetId: "person-1",
  targetName: "Ada Lovelace",
  targetLinkedInUrl: "https://www.linkedin.com/in/ada-lovelace/",
  authorName: "Ada Lovelace",
  postUrl: "https://www.linkedin.com/posts/ada-lovelace_product-launch?trk=feed",
  publishedAt: "2026-10-10T08:00:00+08:00",
  summary: "Announced a new enterprise product launch.",
  evidence: "A timely product initiative creates an outreach opening.",
  relevant: true,
  priority: "high",
};

test("ingests a verified LinkedIn finding as a deduplicated Signal", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const result = await ingestLinkedInFindings(
    { findings: [finding] },
    async (input) => {
      calls.push(input);
      return { id: "notification-1" } as never;
    },
  );
  assert.deepEqual(result, { received: 1, accepted: 1, inserted: 1, duplicate: 0, rejected: [] });
  assert.equal(calls[0]?.dedupeKey, "linkedin.updated:brand-1:https://www.linkedin.com/posts/ada-lovelace_product-launch");
  const body = JSON.parse(String(calls[0]?.body));
  assert.equal(body.relevant, true);
  assert.equal(body.highPriority, true);
  assert.equal(body.sourceUrl, "https://www.linkedin.com/posts/ada-lovelace_product-launch");
});

test("rejects profile URLs and malformed findings without writing a Signal", async () => {
  let writes = 0;
  const result = await ingestLinkedInFindings(
    { findings: [{ ...finding, postUrl: "https://www.linkedin.com/in/ada-lovelace/" }] },
    async () => {
      writes += 1;
      return null;
    },
  );
  assert.equal(writes, 0);
  assert.equal(result.accepted, 0);
  assert.match(result.rejected[0]?.error || "", /direct HTTPS LinkedIn post URL/);
});

