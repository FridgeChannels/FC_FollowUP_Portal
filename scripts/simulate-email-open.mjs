#!/usr/bin/env node
/**
 * Simulate an email open-tracking pixel hit, end to end.
 *
 * The Signals email signal is produced by a 1x1 pixel that outbound mail
 * carries. This script builds a *valid* token with the same algorithm the
 * portal uses (`lib/signals/email-tracking.ts`), fetches the pixel route, and
 * (by default) reads the store back to prove the `email.opened` row landed.
 *
 * It is the fast path for testing the display half of the feature without
 * sending — and without opening — a real email.
 *
 * Usage:
 *   node scripts/simulate-email-open.mjs
 *   node scripts/simulate-email-open.mjs --brand=<brandId> --subject="Q3 samples"
 *   node scripts/simulate-email-open.mjs --base=https://followup-portal.fridgechannels.com
 *   node scripts/simulate-email-open.mjs --no-verify
 *   node scripts/simulate-email-open.mjs --help
 *
 * Notes:
 * - The secret is `EMAIL_TRACK_SECRET`, falling back to `REPLY_INGEST_TOKEN`,
 *   read from `.env` — the same resolution `lib/signals/email-config.ts` uses.
 * - A real mail client never sends `Sec-Fetch-Site` or a portal `Referer`, and
 *   neither does this script; the route ignores same-origin hits on purpose so
 *   the portal's own Timeline preview cannot fake an open.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_VERSION = "eo1";
const SIGNATURE_HEX_LENGTH = 32;
const OPEN_TRACKING_PATH = "/api/track/open";
/** `[TEST] FridgeChannel Peter` — the brand used for Signals smoke tests. */
const DEFAULT_BRAND = "3dc9166f-d9fd-80cb-b68d-ea31f82e4f87";
const DEFAULT_BASE = "http://localhost:5173";
/** What Gmail's image proxy looks like; makes the stored User-Agent realistic. */
const DEFAULT_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 GoogleImageProxy";

function loadDotEnv() {
  const out = {};
  let text = "";
  try {
    text = readFileSync(join(ROOT, ".env"), "utf8");
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function parseArgs(argv) {
  const flags = { verify: true };
  for (const raw of argv.slice(2)) {
    if (raw === "--help" || raw === "-h") flags.help = true;
    else if (raw === "--no-verify") flags.verify = false;
    else if (raw.startsWith("--")) {
      const eq = raw.indexOf("=");
      if (eq === -1) flags[raw.slice(2)] = "true";
      else flags[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return flags;
}

const HELP = `Simulate an email open-tracking pixel hit for Signals.

  --brand=<id>       Follow-up Client brand id (default: ${DEFAULT_BRAND})
  --message=<id>     Portal Message ID, the grouping key for one email (default: generated)
  --subject=<text>   Email subject shown on the signal (default: "Local open-tracking test")
  --thread=<id>      Portal Thread ID (optional)
  --contact=<id>     Follow-up Contact id (optional)
  --base=<url>       Portal origin to hit (default: ${DEFAULT_BASE})
  --ua=<string>      User-Agent to send (default: a Gmail image proxy)
  --no-verify        Skip the read-back check against Supabase
  --help             Show this message

The default message id includes a timestamp, so each run produces a new signal.
Re-running with an explicit --message=<same id> exercises the dedupe path.
`;

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

/** Same shape as `buildOpenTrackingToken`: version.base64url(payload).hmac16 */
async function buildToken(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = (await sign(secret, body)).slice(0, SIGNATURE_HEX_LENGTH);
  return `${TOKEN_VERSION}.${body}.${signature}`;
}

async function readBack(env, messageId) {
  const url = new URL("/rest/v1/system_notifications", env.SUPABASE_URL);
  url.searchParams.set("select", "type,brand_id,title,body,dedupe_key,created_at");
  url.searchParams.set("type", "eq.email.opened");
  url.searchParams.set("dedupe_key", `like.email.opened:${messageId}:%`);
  url.searchParams.set("order", "created_at.desc");
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  const flags = parseArgs(process.argv);
  if (flags.help) {
    process.stdout.write(HELP);
    return;
  }

  const env = { ...loadDotEnv(), ...process.env };
  const secret = (env.EMAIL_TRACK_SECRET || env.REPLY_INGEST_TOKEN || "").trim();
  if (!secret) {
    console.error(
      "No signing secret. Set EMAIL_TRACK_SECRET or REPLY_INGEST_TOKEN in .env\n" +
        "(without either, the portal injects no pixel at all).",
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `secret: ${
      env.EMAIL_TRACK_SECRET ? "EMAIL_TRACK_SECRET" : "REPLY_INGEST_TOKEN (fallback)"
    } (${secret.length} chars)`,
  );

  const brand = flags.brand || DEFAULT_BRAND;
  const subject = flags.subject || "Local open-tracking test";
  const messageId = flags.message || `MSG-EMAILTEST-${Date.now()}`;
  const base = (flags.base || DEFAULT_BASE).replace(/\/+$/, "");

  const payload = { b: brand, m: messageId, s: subject };
  if (flags.thread) payload.t = flags.thread;
  if (flags.contact) payload.c = flags.contact;

  const token = await buildToken(payload, secret);
  const pixelUrl = `${base}${OPEN_TRACKING_PATH}/${token}`;

  console.log(`brand:   ${brand}`);
  console.log(`message: ${messageId}`);
  console.log(`pixel:   ${pixelUrl}`);

  const response = await fetch(pixelUrl, {
    headers: { "User-Agent": flags.ua || DEFAULT_UA, Accept: "image/*,*/*;q=0.8" },
  });
  const contentType = response.headers.get("content-type") || "";
  const body = new Uint8Array(await response.arrayBuffer());
  console.log(`\nGET -> ${response.status} ${contentType} (${body.byteLength} bytes)`);

  if (!contentType.startsWith("image/")) {
    console.error(
      "\nNot the pixel route — this origin served something else (an HTML app shell,\n" +
        "or a 404 page). Deploy `/api/track/open/[token]` there before pointing `--base` at it.",
    );
    process.exitCode = 1;
    return;
  }
  if (response.status !== 200) {
    console.error("\nThe pixel must always answer 200. Something is wrong in the route.");
    process.exitCode = 1;
    return;
  }

  if (!flags.verify) return;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("\n(skipping read-back: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured)");
    return;
  }

  // The route writes the row before answering, so it is already readable here.
  const rows = await readBack(env, messageId);
  if (!rows.length) {
    console.error(
      "\nNo email.opened row found. The pixel answered 200, so the write either failed\n" +
        "(check the dev log for [email-open] track failed) or the token was rejected —\n" +
        "most likely the server loaded a different secret than this script did.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`\nstored ${rows.length} row(s):`);
  for (const row of rows) console.log(`  ${row.created_at}  ${row.title}  ${row.dedupe_key}`);
  const meta = JSON.parse(rows[0].body || "{}");
  console.log(`  body: ${JSON.stringify(meta)}`);
  console.log(`\nOpen  ${base}/signals?brand=${encodeURIComponent(brand)}  to see the signal.`);
}

await main();
