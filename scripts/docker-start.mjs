#!/usr/bin/env node
/**
 * Container entrypoint for the Vinext/Wrangler local preview.
 * Writes Cloudflare `.dev.vars` from process env, then starts wrangler.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
  "NOTIFY_CONTENT_MAX_CHARS",
  "PORTAL_BASE_URL",
  "QUO_API_KEY",
  "QUO_FROM_NUMBER",
  "DEV_CALL_PHONE",
  "QUO_WEBHOOK_KEY",
  "QUO_WEBHOOK_SIGNING_SECRET",
  "QUO_WEBHOOK_SIGNING_SECRETS",
  "DISPLAY_TIME_ZONE",
  "SENDER_NAME",
];

function escapeDevVar(value) {
  // .dev.vars is dotenv-like; quote values that need it.
  if (/[\s#"']/.test(value) || value === "") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

const lines = [];
for (const key of WORKER_ENV_KEYS) {
  const value = process.env[key];
  if (value == null || value === "") continue;
  lines.push(`${key}=${escapeDevVar(value)}`);
}

writeFileSync(path.join(projectRoot, ".dev.vars"), `${lines.join("\n")}\n`, {
  encoding: "utf8",
  mode: 0o600,
});

mkdirSync(path.join(projectRoot, ".wrangler", "state"), { recursive: true });

const wranglerBin = path.join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const wranglerConfig = path.join(projectRoot, "dist", "server", "wrangler.json");

const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    wranglerBin,
    "dev",
    "--config",
    wranglerConfig,
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--ip",
    HOST,
    "--port",
    String(PORT),
    "--inspector-port",
    "0",
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
