// End-to-end proof for SIGNALS_DEV_MODE: insert two taps from the SAME device
// into the Peter test brand, then confirm the signals API surfaces BOTH as new.
// Temporary diagnostic script — deletes its own rows at the end.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
const BRAND = "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87";
const COOKIE = "fc_portal_session=%7B%22email%22%3A%22peter%40fridgechannels.com%22%7D";
const DEVICE = "test-devmode-device";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const now = new Date().toISOString();
const rows = [1, 2].map((n) => ({
  brand_id: BRAND,
  sn: "P978SGEV0M",
  device_id: DEVICE,
  posthog_event_uuid: randomUUID(),
  occurred_at: new Date(Date.now() - n * 60_000).toISOString(),
  synced_at: now,
  is_internal: false,
  url: "https://example.com/devmode",
  geo_city: "Local",
  geo_country: "US",
  browser: "Test",
  os: "macOS",
}));

console.log("1) inserting two taps (same device:", DEVICE + ")");
const ins = await fetch(`${SUPABASE_URL}/rest/v1/sample_tap_visits`, {
  method: "POST",
  headers: headers({ Prefer: "return=representation" }),
  body: JSON.stringify(rows),
});
const inserted = await ins.json();
console.log("   insert HTTP", ins.status, "| rows:", inserted.length);
if (!Array.isArray(inserted) || inserted.length !== 2) {
  console.log("   ABORT: insert failed", JSON.stringify(inserted).slice(0, 300));
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 3000));

console.log("2) GET /api/signals (list) and find brand " + BRAND);
const api = await fetch("http://127.0.0.1:5173/api/signals", {
  headers: { Cookie: COOKIE },
});
const text = await api.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  console.log("   API HTTP", api.status, "| raw:", text.slice(0, 200));
  process.exit(1);
}
const brand = (payload.brands || []).find((b) => b.id === BRAND);
const samples = (brand?.events || []).filter((e) => e.type === "sample");
const deviceSamples = samples.filter((e) => e.sampleDeviceId === DEVICE);
console.log("   API HTTP", api.status);
console.log("   sample events for test device:", deviceSamples.length);
for (const e of deviceSamples) {
  console.log(`     - ${e.id.slice(0, 8)} isNewSignal=${e.isNewSignal} summary="${e.summary}"`);
}
const newCount = deviceSamples.filter((e) => e.isNewSignal).length;
console.log("   >>> new signals from this device:", newCount, "/ 2");
console.log(
  newCount === 2
    ? "   PASS: dev mode disabled cooldown — every tap is its own Signal ✅"
    : "   FAIL: cooldown still active (expected 2 new)",
);
console.log("   brand.unread =", brand?.unread, "| needsReview =", brand?.needsReview);

console.log("3) cleaning up inserted rows");
for (const r of inserted) {
  await fetch(
    `${SUPABASE_URL}/rest/v1/sample_tap_visits?posthog_event_uuid=eq.${r.posthog_event_uuid}`,
    { method: "DELETE", headers: headers() },
  );
}
console.log("   done. (rows deleted:", inserted.length, ")");
