#!/usr/bin/env node
/**
 * Send one real Slack notification using .env (does not use unit-test mocks).
 *
 *   node scripts/notify-slack-test.mjs
 *   node scripts/notify-slack-test.mjs --sample
 *
 * --sample posts a Sample tap layout. When SLACK_SIGNING_SECRET is set, includes
 * the Mark internal button (requires Interactivity Request URL on the Slack App).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wantSample = process.argv.includes("--sample");

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
const samplePortalUrl = `${portalUrl}/sample`;
const signingSecret = (process.env.SLACK_SIGNING_SECRET || "").trim();

let payload;
if (wantSample) {
  const deviceId = "local-test-device-001";
  const actions = [
    {
      type: "button",
      text: { type: "plain_text", text: "Open Sample in Portal", emoji: true },
      url: samplePortalUrl,
      action_id: "open_sample_portal",
    },
  ];
  if (signingSecret) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "Mark internal", emoji: true },
      action_id: "mark_internal_device",
      value: JSON.stringify({ deviceId, brandId }),
      confirm: {
        title: { type: "plain_text", text: "Mark device as internal?" },
        text: {
          type: "mrkdwn",
          text: `Future taps from device \`${deviceId}\` will be hidden and no longer notify Slack.`,
        },
        confirm: { type: "plain_text", text: "Mark internal" },
        deny: { type: "plain_text", text: "Cancel" },
      },
    });
  }
  payload = {
    text: [
      "Sample tap · Sample",
      "Notify Layout Test",
      "",
      "Owner: Ella",
      "SN: 93H68D44ER",
      "Location: Debug City, Test",
      "Device: curl · local",
      "",
      "URL: https://tap.fridgechannels.com/p/93H68D44ER",
      "",
      `Open Sample: ${samplePortalUrl}`,
    ].join("\n"),
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Sample tap · Sample", emoji: true },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "*Notify Layout Test*" },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: "*Owner*\nElla" },
          { type: "mrkdwn", text: "*SN*\n93H68D44ER" },
          { type: "mrkdwn", text: "*Location*\nDebug City, Test" },
          { type: "mrkdwn", text: "*Device*\ncurl · local" },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*URL*\nhttps://tap.fridgechannels.com/p/93H68D44ER",
        },
      },
      { type: "actions", block_id: "sample_actions", elements: actions },
    ],
  };
} else {
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

  payload = {
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
}

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

if (wantSample) {
  console.log("Slack sample webhook OK — check your channel for Sample tap + buttons.");
  console.log(
    signingSecret
      ? "Mark internal button included (SLACK_SIGNING_SECRET set)."
      : "Mark internal omitted — set SLACK_SIGNING_SECRET to include it.",
  );
  console.log(`Portal link: ${samplePortalUrl}`);
} else {
  console.log("Slack webhook OK — check your channel for the new layout + Open brand button.");
  console.log(`Portal link: ${portalUrl}`);
}