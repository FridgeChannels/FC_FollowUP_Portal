/**
 * Move magnet_brand_param.primary_color onto secondary_color for SNs listed
 * in the Notion "Client SN List", then set primary_color to #FFFFFF.
 *
 * Only Notion rows whose checked box is clear are included. After a row is
 * finished, checked is set. A dry run logs that check and does not write it.
 *
 * Default is a dry run: nothing is written to Supabase or Notion.
 * Pass --apply to write both.
 *
 *   node scripts/swap-magnet-brand-colors.mjs
 *   node scripts/swap-magnet-brand-colors.mjs --apply
 *   node scripts/swap-magnet-brand-colors.mjs --apply --limit 1
 *   node scripts/swap-magnet-brand-colors.mjs --apply --sn Q5V78Z397W
 *   node scripts/swap-magnet-brand-colors.mjs --include-already-white
 *
 * Audit logs go to logs/magnet-color-swap/<timestamp>/ and are gitignored.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertColorPatch,
  notionCheckDecision,
  planMagnetColorChange,
  unexpectedChangedColumns,
} from "./magnet-color-plan.mjs";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const NOTION_DATABASE_ID = "14cb01fa-2ad7-48d1-ae0c-51473f824ec9";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = parseArgs(process.argv.slice(2));
const apply = args.has("apply");
const includeAlreadyWhite = args.has("include-already-white");
const limit = args.get("limit") ? Number(args.get("limit")) : null;
const onlySn = (args.get("sn") || "").trim().toUpperCase();
if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error("--limit must be a positive integer");
}

const env = await loadEnv(path.join(ROOT, ".env"));
const notionKey = process.env.NOTION_API_KEY || env.NOTION_API_KEY;
const supabaseUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!notionKey) throw new Error("NOTION_API_KEY is not configured");
if (!supabaseUrl || !supabaseKey) throw new Error("Supabase URL or service role key is not configured");

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const logDir = path.join(ROOT, "logs", "magnet-color-swap", runId);
await mkdir(logDir, { recursive: true });
const jsonlPath = path.join(logDir, "changes.jsonl");
const summaryPath = path.join(logDir, "summary.json");

const notionRows = await listNotionSns(notionKey);
let selected = onlySn
  ? notionRows.filter((row) => row.sn.toUpperCase() === onlySn)
  : notionRows;
if (onlySn && !selected.length) {
  throw new Error(`未找到未勾选的 SN: ${onlySn}`);
}
if (limit) selected = selected.slice(0, limit);
const bySn = new Map();
for (const row of selected) {
  const key = row.sn.toUpperCase();
  const bucket = bySn.get(key) || [];
  bucket.push(row);
  bySn.set(key, bucket);
}

const matched = await fetchBrandParams([...bySn.keys()], supabaseUrl, supabaseKey);
const paramsBySn = new Map();
for (const row of matched) {
  const key = String(row.magnet_sn || "").trim().toUpperCase();
  const bucket = paramsBySn.get(key) || [];
  bucket.push(row);
  paramsBySn.set(key, bucket);
}

const counts = {
  notion_rows_with_sn: notionRows.length,
  considered: selected.length,
  unique_sns: bySn.size,
  matched_rows: 0,
  planned_or_applied: 0,
  skipped_primary_already_white: 0,
  skipped_already_target: 0,
  unmatched_sns: 0,
  anomalies: 0,
  notion_checks_planned: 0,
  notion_checks_written: 0,
  duplicate_notion_sns: [...bySn.values()].filter((rows) => rows.length > 1).length,
};
async function appendLines(rows) {
  if (!rows.length) return;
  await appendFile(jsonlPath, rows.map((line) => JSON.stringify(line)).join("\n") + "\n");
}

for (const notionRow of selected) {
  const snKey = notionRow.sn.toUpperCase();
  const params = paramsBySn.get(snKey) || [];
  const rowLines = [];
  if (!params.length) {
    counts.unmatched_sns += 1;
    rowLines.push(entry({
      action: "unmatched",
      reason: "no_magnet_brand_param",
      sn: notionRow.sn,
      notion_pages: [notionRef(notionRow)],
      wrote: false,
    }));
  } else {
    counts.matched_rows += params.length;
    for (const param of params) {
      rowLines.push(await handleParam(param, notionRow));
    }
  }

  const decision = notionCheckDecision(rowLines.map((line) => line.action));
  if (!decision.check) {
    await appendLines(rowLines);
    continue;
  }

  await appendLines(rowLines);
  const checkLine = await markChecked(notionRow);
  if (checkLine.wrote) counts.notion_checks_written += 1;
  else counts.notion_checks_planned += 1;
  await appendLines([checkLine]);
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  notion_database_id: NOTION_DATABASE_ID,
  include_already_white: includeAlreadyWhite,
  sn: onlySn || null,
  limit,
  ...counts,
  log_dir: path.relative(ROOT, logDir),
  changes_jsonl: path.relative(ROOT, jsonlPath),
};
await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

function entry(fields) {
  return {
    at: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    ...fields,
  };
}

function notionRef(row) {
  return {
    page_id: row.pageId,
    brand: row.brand,
    url: row.url,
    checked: false,
  };
}

async function handleParam(param, notionRow) {
  const plan = planMagnetColorChange(param, { includeAlreadyWhite });
  const base = {
    sn: param.magnet_sn,
    magnet_brand_param_id: param.id,
    notion_pages: [notionRef(notionRow)],
    before: plan.before,
    after: plan.after,
    patch: plan.patch,
    wrote: false,
  };
  if (plan.action === "skip") {
    if (plan.reason === "primary_already_white") counts.skipped_primary_already_white += 1;
    if (plan.reason === "already_target") counts.skipped_already_target += 1;
    return entry({ ...base, action: "skip", reason: plan.reason });
  }
  if (!apply) {
    counts.planned_or_applied += 1;
    return entry({ ...base, action: "dry_run", reason: null });
  }

  assertColorPatch(plan.patch);
  const beforeFull = await selectRowById(param.id, supabaseUrl, supabaseKey);
  await patchRowById(param.id, plan.patch, supabaseUrl, supabaseKey);
  const afterFull = await selectRowById(param.id, supabaseUrl, supabaseKey);
  const unexpected = unexpectedChangedColumns(beforeFull, afterFull);
  const colorOk = afterFull
    && afterFull.primary_color === plan.after.primary_color
    && (afterFull.secondary_color ?? null) === plan.after.secondary_color;
  if (unexpected.length || !colorOk) {
    counts.anomalies += 1;
    return entry({
      ...base,
      action: "anomaly",
      reason: !colorOk ? "color_mismatch" : "other_columns_changed",
      wrote: true,
      unexpected_columns: unexpected,
      after: afterFull
        ? {
            primary_color: afterFull.primary_color ?? null,
            secondary_color: afterFull.secondary_color ?? null,
          }
        : null,
    });
  }
  counts.planned_or_applied += 1;
  return entry({
    ...base,
    action: "applied",
    reason: null,
    wrote: true,
    unexpected_columns: [],
    after: {
      primary_color: afterFull.primary_color ?? null,
      secondary_color: afterFull.secondary_color ?? null,
    },
  });
}

async function markChecked(notionRow) {
  const before = { checked: false };
  const after = { checked: true };
  if (!apply) {
    return entry({
      action: "notion_check",
      reason: null,
      sn: notionRow.sn,
      notion_pages: [notionRef(notionRow)],
      before,
      after,
      patch: { checked: true },
      wrote: false,
    });
  }
  const page = await notionFetch(notionKey, `/pages/${notionRow.pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: { checked: { checkbox: true } },
    }),
  });
  const checked = page?.properties?.checked?.checkbox === true;
  if (!checked) {
    throw new Error(`Notion checked 未勾上: ${notionRow.pageId}`);
  }
  return entry({
    action: "notion_check",
    reason: null,
    sn: notionRow.sn,
    notion_pages: [notionRef(notionRow)],
    before,
    after,
    patch: { checked: true },
    wrote: true,
  });
}

async function listNotionSns(key) {
  const rows = [];
  let cursor;
  do {
    const data = await notionFetch(key, `/databases/${NOTION_DATABASE_ID}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        filter: {
          and: [
            { property: "sn", rich_text: { is_not_empty: true } },
            { property: "checked", checkbox: { equals: false } },
          ],
        },
      }),
    });
    for (const page of data.results || []) {
      const sn = plainText(page.properties?.sn).trim();
      if (!sn || page.properties?.checked?.checkbox === true) continue;
      rows.push({
        pageId: page.id,
        url: page.url || null,
        sn,
        brand: plainText(page.properties?.brand).trim() || null,
      });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return rows;
}

function plainText(property) {
  const chunks = property?.rich_text || property?.title || [];
  return chunks.map((chunk) => chunk?.plain_text || "").join("");
}

async function notionFetch(key, apiPath, init) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${NOTION_API}${apiPath}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${key}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
      });
      if (response.ok) return response.json();
      const body = await response.text();
      if (response.status === 404) {
        throw new Error(
          "Notion 数据库不可见。请把 Client SN List 分享给集成 Peter API 后再运行。",
        );
      }
      if (![429, 502, 503, 504].includes(response.status) || attempt === 5) {
        throw new Error(`Notion ${response.status}: ${body.slice(0, 300)}`);
      }
    } catch (error) {
      if (attempt === 5 || String(error?.message || "").startsWith("Notion")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(400 * 2 ** (attempt - 1), 8_000)));
  }
}

async function fetchBrandParams(snKeys, url, key) {
  const rows = [];
  const chunkSize = 40;
  for (let index = 0; index < snKeys.length; index += chunkSize) {
    const chunk = snKeys.slice(index, index + chunkSize);
    const or = chunk
      .map((sn) => `magnet_sn.ilike.${quoteFilterValue(escapeLike(sn))}`)
      .join(",");
    const found = await supabaseGet(
      url,
      key,
      `/rest/v1/magnet_brand_param?select=id,magnet_sn,primary_color,secondary_color&or=(${or})`,
    );
    rows.push(...found);
  }
  return rows;
}

async function selectRowById(id, url, key) {
  const rows = await supabaseGet(
    url,
    key,
    `/rest/v1/magnet_brand_param?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  if (!rows[0]) throw new Error(`magnet_brand_param ${id} disappeared before update`);
  return rows[0];
}

async function patchRowById(id, patch, url, key) {
  assertColorPatch(patch);
  const endpoint =
    `/rest/v1/magnet_brand_param?id=eq.${encodeURIComponent(id)}&select=id,magnet_sn,primary_color,secondary_color`;
  const response = await supabaseFetch(`${url}${endpoint}`, {
    method: "PATCH",
    headers: supabaseHeaders(key, "return=representation"),
    body: JSON.stringify(patch),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase patch ${id} failed: ${response.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : [];
}

async function supabaseGet(url, key, endpoint) {
  const response = await supabaseFetch(`${url}${endpoint}`, { headers: supabaseHeaders(key) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status} ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : [];
}

async function supabaseFetch(url, init) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === 5 || ![429, 502, 503, 504].includes(response.status)) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 5) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(400 * 2 ** (attempt - 1), 8_000)));
  }
  throw lastError;
}

function supabaseHeaders(key, prefer) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function escapeLike(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function quoteFilterValue(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function parseArgs(argv) {
  const flags = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [name, inline] = token.slice(2).split("=", 2);
    if (inline != null) values.set(name, inline);
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values.set(name, argv[++index]);
    else flags.add(name);
  }
  return {
    has: (name) => flags.has(name) || values.has(name),
    get: (name) => values.get(name),
  };
}

async function loadEnv(file) {
  const text = await readFile(file, "utf8");
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    parsed[key] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return parsed;
}
