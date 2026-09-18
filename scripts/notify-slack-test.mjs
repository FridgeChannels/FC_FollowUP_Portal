#!/usr/bin/env node
/**
 * Send one real Slack notification using .env (does not use unit-test mocks).
 *
 *   node scripts/notify-slack-test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function loadDotEnv() {
  try {
    const text = readFileSync(path.join(root, ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadDotEnv();

const webhookUrl = (process.env.SLACK_WEBHOOK_URL || "").trim();
if (!webhookUrl) {
  console.error("SLACK_WEBHOOK_URL is empty — set it in .env first.");
  process.exit(1);
}

const portalBase = (
  process.env.PORTAL_BASE_URL || "https://followup-portal.fridgechannels.com"
).replace(/\/+$/, "");
const brandId = "notify-test-brand";
const portalUrl = `${portalBase}/customers/${encodeURIComponent(brandId)}`;

const text = [
  "Cold Inbound · Email",
  "Notify Layout Test",
  "",
  "Owner: Ella",
  "Contact: Jane Doe",
  "From: buyer@acme.com",
  "Status: Needs Reply",
  "Due: (test)",
  "Subject: Magnet inquiry",
  "",
  "Preview: Real Slack Block Kit smoke test",
  "",
  `Open brand: ${portalUrl}`,
].join("\n");

const payload = {
  text,
  blocks: [
    {
      type: "header",
      text: { type: "plain_text", text: "Cold Inbound · Email", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Notify Layout Test*" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: "*Owner*\nElla" },
        { type: "mrkdwn", text: "*Contact*\nJane Doe" },
        { type: "mrkdwn", text: "*From*\nbuyer@acme.com" },
        { type: "mrkdwn", text: "*Status*\nNeeds Reply" },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Preview*\n> Real Slack Block Kit smoke test",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open brand in Portal", emoji: true },
          url: portalUrl,
          action_id: "open_brand_portal",
        },
      ],
    },
  ],
};

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const body = await response.text().catch(() => "");
if (!response.ok) {
  console.error(`Slack webhook failed: HTTP ${response.status}`, body);
  process.exit(1);
}

console.log("Slack webhook OK — check your channel for the new layout + Open brand button.");
console.log(`Portal link: ${portalUrl}`);
