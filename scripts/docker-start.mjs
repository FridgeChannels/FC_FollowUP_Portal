#!/usr/bin/env node
/**
 * Container entrypoint for the Vinext Node production server.
 * Compose injects secrets via env_file → process.env; a small loader shim
 * exposes them as `cloudflare:workers` `env` for the built Worker bundle.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(projectRoot);

await import("./sites-env.mjs");

const PORT = process.env.PORT || "8787";
const HOST = process.env.HOST || "0.0.0.0";

const WORKER_ENV_KEYS = [
  "NOTION_API_KEY",
  "NOTION_FOLLOWUP_CLIENT_DB_ID",
  "NOTION_CLIENT_DB_ID",
  "NOTION_EXHIBITION_DB_ID",
  "NOTION_FOLLOWUP_OWNER_DB_ID",
  "NOTION_FOLLOWUP_CONTACT_DB_ID",
  "NOTION_FOLLOWUP_CONVERSATION_DB_ID",
  "NOTION_FOLLOWUP_TASK_DB_ID",
  "NOTION_FOLLOWUP_BOMB_DB_ID",
  "NOTION_FOLLOWUP_SCENARIO_DB_ID",
  "NOTION_FOLLOWUP_TEMPLATE_DB_ID",
  "NOTION_FOLLOWUP_CAPACITY_DB_ID",
  "NOTION_FOLLOWUP_CHECKPOINT_DB_ID",
  "NOTION_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID",
  "NOTION_FOLLOWUP_MEETING_LIST_PAGE_ID",
  "NOTION_KEY_PERSON_DB_ID",
  "ADMIN_EMAILS",
  "NOTION_ADMIN_EMAILS",
  "SKIP_UNAVAILABLE_CHANNELS",
  "SCHEDULE_TEST_MODE",
  "REPLY_INGEST_TOKEN",
  "NOTIFY_ENABLED",
  "NOTIFY_SLACK_ENABLED",
  "SLACK_WEBHOOK_URL",
  "NOTIFY_ON_REPLY",
  "NOTIFY_ON_INBOUND",
  "NOTIFY_ON_PHONE",
  "NOTIFY_ON_SAMPLE_VISIT",
  "NOTIFY_CONTENT_MAX_CHARS",
  "PORTAL_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "POSTHOG_HOST",
  "POSTHOG_PERSONAL_API_KEY",
  "POSTHOG_PROJECT_ID",
  "SAMPLE_SYNC_SECRET",
  "SAMPLE_SYNC_MAX_SNS_PER_RUN",
  "SAMPLE_SYNC_LIMIT_PER_SN",
  "SAMPLE_NOTIFY_DEDUPE_MINUTES",
  "SAMPLE_PAGE_SYNC_STALE_MINUTES",
  "SAMPLE_TAP_BASE_URL",
  "QUO_API_KEY",
  "QUO_FROM_NUMBER",
  "DEV_CALL_PHONE",
  "QUO_WEBHOOK_KEY",
  "QUO_WEBHOOK_SIGNING_SECRET",
  "QUO_WEBHOOK_SIGNING_SECRETS",
  "DISPLAY_TIME_ZONE",
  "SENDER_NAME",
  "ICYPEAS_API_KEY",
  "ICYPEAS_ACCOUNT_EMAIL",
  "FULLENRICH_API_KEY",
  "WA_PROBE_API_TOKEN",
  "WA_API_TOKEN",
  "WA_PROBE_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_DEFAULT_REGION",
  "S3_BUCKET",
  "S3_KEY_PREFIX",
  "S3_VIDEO_PREFIX",
  "S3_CREATOR_PREFIX",
  "S3_FILE_PREFIX",
  "EMAIL_ATTACHMENT_MIME_TYPES",
  "EMAIL_ATTACHMENT_MAX_BYTES",
  "EMAIL_ATTACHMENT_MAX_COUNT",
  "DTC_DASHBOARD_URL",
  "DTC_DASHBOARD_KEY",
];

const presentKeys = WORKER_ENV_KEYS.filter((key) => {
  const value = process.env[key];
  return value != null && value !== "";
});

const rscEntry = path.join(projectRoot, "dist", "server", "index.js");
if (!existsSync(rscEntry)) {
  console.error(
    "[docker-start] Missing dist/server/index.js — run `npm run build` before docker compose build.",
  );
  process.exit(1);
}

const vinextCli = path.join(
  projectRoot,
  "node_modules",
  "vinext",
  "dist",
  "cli.js",
);
if (!existsSync(vinextCli)) {
  console.error(
    "[docker-start] Missing vinext — Docker image must install the vinext package.",
  );
  process.exit(1);
}

const hasSupabase = presentKeys.includes("SUPABASE_SERVICE_ROLE_KEY");
console.log(
  `[docker-start] Starting vinext production server on ${HOST}:${PORT}` +
    ` (${presentKeys.length} worker env keys present;` +
    ` SUPABASE_SERVICE_ROLE_KEY=${hasSupabase ? "yes" : "NO"})`,
);
if (!hasSupabase) {
  console.warn(
    "[docker-start] SUPABASE_SERVICE_ROLE_KEY missing from container env — /api/.../sample will return 503",
  );
}

const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "--import",
    "./scripts/register-cloudflare-workers-shim.mjs",
    vinextCli,
    "start",
    "-p",
    String(PORT),
    "-H",
    HOST,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  },
);

const forward = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => forward("SIGINT"));
process.on("SIGTERM", () => forward("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
