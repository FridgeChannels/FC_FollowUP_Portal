import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { emitNotification } from "./core.ts";
import {
  SLACK_MARK_INTERNAL_ACTION_ID,
  SLACK_SAMPLE_ACTIONS_BLOCK_ID,
  SLACK_UNMARK_INTERNAL_ACTION_ID,
  decodeMarkInternalValue,
  formatSlackNotificationBlocks,
  formatSlackNotificationText,
  truncatePreview,
} from "./format.ts";
import {
  findInternalDeviceAction,
  internalDeviceStatusBlocks,
  parseSlackInteractionBody,
  slackUserLabel,
} from "./slack-interactions.ts";
import { verifySlackSignature } from "./slack-signature.ts";
import { createSlackWebhookProvider } from "./slack-provider.ts";
import type { NotificationEvent } from "./types.ts";

const baseEvent: NotificationEvent = {
  eventType: "reply.received",
  channel: "Email",
  brandId: "brand-1",
  brandName: "Acme",
  ownerName: "Ella",
  contactName: "Jane Doe",
  sender: "buyer@acme.com",
  contentPreview: "Yes, Mike has the Magnet.",
  conversationId: "conv-1",
  taskId: "task-1",
  inboxStatus: "Needs Reply",
  replyDueAt: "2026-09-19T19:00:00.000Z",
};

describe("truncatePreview", () => {
  it("returns empty for blank input", () => {
    assert.equal(truncatePreview("  ", 300), "");
  });

  it("truncates long text with ellipsis", () => {
    assert.equal(truncatePreview("abcdefghij", 5), "abcd…");
  });
});

describe("formatSlackNotificationText", () => {
  it("labels significant Exhibition updates without treating them as inbound replies", () => {
    const text = formatSlackNotificationText({ eventType: "encounter.updated", channel: "Exhibition", brandName: "Brand", ownerName: "Ella", subject: "Newtopia", contentPreview: "Customer requested product information.", portalUrl: "https://portal.example/customers/brand?followupHistory=1" }, { contentMaxChars: 300 });
    assert.match(text, /^Exhibition key changes · Exhibition/m);
    assert.match(text, /Owner: Ella/);
    assert.match(text, /followupHistory=1/);
  });
  it("uses one field per line and includes portal link", () => {
    const text = formatSlackNotificationText(baseEvent, {
      contentMaxChars: 300,
      formatDueAt: (iso) => `formatted:${iso}`,
      resolvePortalUrl: (event) =>
        `https://portal.example/customers/${event.brandId}`,
    });
    assert.match(text, /^Reply · Email/m);
    assert.match(text, /^Acme$/m);
    assert.match(text, /^Owner: Ella$/m);
    assert.match(text, /^Contact: Jane Doe$/m);
    assert.match(text, /^From: buyer@acme\.com$/m);
    assert.match(text, /^Status: Needs Reply$/m);
    assert.match(text, /^Due: formatted:2026-09-19T19:00:00\.000Z$/m);
    assert.match(text, /Open brand: https:\/\/portal\.example\/customers\/brand-1/);
    assert.doesNotMatch(text, /conversationId:/);
  });

  it("labels cold inbound", () => {
    const text = formatSlackNotificationText(
      {
        ...baseEvent,
        eventType: "inbound.received",
        taskId: null,
      },
      { contentMaxChars: 300 },
    );
    assert.match(text, /^Cold Inbound · Email/m);
  });

  it("formats sample tap without empty reply fields", () => {
    const text = formatSlackNotificationText(
      {
        eventType: "sample.visited",
        channel: "Amazon",
        brandName: "Ancient Nutrition",
        ownerName: "Ella",
        subject: "93H68D44ER",
        sender: "Tokyo, Japan",
        contactName: "Mobile Safari · iOS",
        contentPreview: "https://tap.fridgechannels.com/p/93H68D44ER",
        portalUrl: "https://portal.example/customers/brand-1/sample",
      },
      { contentMaxChars: 300 },
    );
    assert.match(text, /^Sample tap · Amazon/m);
    assert.match(text, /^Owner: Ella$/m);
    assert.match(text, /^SN: 93H68D44ER$/m);
    assert.match(text, /^Location: Tokyo, Japan$/m);
    assert.match(text, /^Device: Mobile Safari · iOS$/m);
    assert.match(text, /^URL: https:\/\/tap\.fridgechannels\.com\/p\/93H68D44ER$/m);
    assert.doesNotMatch(text, /Contact:|From:|Status:|Subject:/);
  });
});

describe("formatSlackNotificationBlocks", () => {
  it("includes Open brand button when portal url resolves", () => {
    const blocks = formatSlackNotificationBlocks(baseEvent, {
      contentMaxChars: 300,
      resolvePortalUrl: () => "https://portal.example/customers/brand-1",
    });
    const actions = blocks.find((block) => block.type === "actions") as
      | { elements?: Array<{ url?: string; text?: { text?: string } }> }
      | undefined;
    assert.equal(actions?.elements?.[0]?.url, "https://portal.example/customers/brand-1");
    assert.equal(actions?.elements?.[0]?.text?.text, "Open brand in Portal");
  });

  const sampleEvent: NotificationEvent = {
    eventType: "sample.visited",
    channel: "Sample",
    brandId: "brand-1",
    brandName: "Acme",
    subject: "93H68D44ER",
    deviceId: "dev-123",
    portalUrl: "https://portal.example/signals?brand=brand-1",
  };

  it("adds Mark internal button for sample taps when enabled", () => {
    const blocks = formatSlackNotificationBlocks(sampleEvent, {
      contentMaxChars: 300,
      markInternalEnabled: true,
    });
    const actions = blocks.find((block) => block.type === "actions") as
      | { block_id?: string; elements?: Array<{ action_id?: string; value?: string }> }
      | undefined;
    assert.equal(actions?.block_id, SLACK_SAMPLE_ACTIONS_BLOCK_ID);
    const mark = actions?.elements?.find((element) => element.action_id === SLACK_MARK_INTERNAL_ACTION_ID);
    assert.deepEqual(decodeMarkInternalValue(mark?.value), { deviceId: "dev-123", brandId: "brand-1" });
  });

  it("omits Mark internal without signing secret, device id, or for non-sample events", () => {
    const hasMark = (event: NotificationEvent, enabled: boolean) =>
      formatSlackNotificationBlocks(event, { contentMaxChars: 300, markInternalEnabled: enabled })
        .some((block) => JSON.stringify(block).includes(SLACK_MARK_INTERNAL_ACTION_ID));
    assert.equal(hasMark(sampleEvent, false), false);
    assert.equal(hasMark({ ...sampleEvent, deviceId: null }, true), false);
    assert.equal(hasMark({ ...baseEvent, deviceId: "dev-123" }, true), false);
  });
});

describe("slack interactions", () => {
  const secret = "test-signing-secret";
  const sign = (body: string, timestamp: number, key = secret) => {
    const headers = new Headers({
      "x-slack-request-timestamp": String(timestamp),
      "x-slack-signature": `v0=${createHmac("sha256", key).update(`v0:${timestamp}:${body}`).digest("hex")}`,
    });
    return headers;
  };

  it("verifies Slack signatures and rejects tampering or stale requests", () => {
    const body = "payload=%7B%7D";
    const now = 1_800_000_000;
    assert.equal(verifySlackSignature({ body, headers: sign(body, now), signingSecret: secret, now }), true);
    assert.equal(verifySlackSignature({ body: `${body}x`, headers: sign(body, now), signingSecret: secret, now }), false);
    assert.equal(verifySlackSignature({ body, headers: sign(body, now, "other"), signingSecret: secret, now }), false);
    assert.equal(verifySlackSignature({ body, headers: sign(body, now - 600), signingSecret: secret, now }), false);
  });

  it("parses the Mark internal action and rewrites the message", () => {
    const blocks = formatSlackNotificationBlocks(
      { eventType: "sample.visited", channel: "Sample", brandId: "brand-1", deviceId: "dev-123", portalUrl: "https://portal.example/x" },
      { contentMaxChars: 300, markInternalEnabled: true },
    );
    const mark = (blocks.find((block) => block.type === "actions") as { elements: Array<{ action_id?: string; value?: string }> })
      .elements.find((element) => element.action_id === SLACK_MARK_INTERNAL_ACTION_ID);
    const body = new URLSearchParams({
      payload: JSON.stringify({
        type: "block_actions",
        user: { id: "U1", username: "mark" },
        actions: [{ action_id: SLACK_MARK_INTERNAL_ACTION_ID, value: mark?.value }],
        message: { text: "Sample tap", blocks },
      }),
    }).toString();
    const payload = parseSlackInteractionBody(body);
    assert.ok(payload);
    const action = findInternalDeviceAction(payload);
    assert.deepEqual(action, { kind: "mark", value: { deviceId: "dev-123", brandId: "brand-1" } });
    assert.equal(slackUserLabel(payload.user), "slack:mark");

    const marked = internalDeviceStatusBlocks(payload.message?.blocks, { action: action!, userId: "U1", clearedUnread: 2 });
    const markedJson = JSON.stringify(marked);
    assert.doesNotMatch(markedJson, new RegExp(`"action_id":"${SLACK_MARK_INTERNAL_ACTION_ID}"`));
    assert.match(markedJson, new RegExp(SLACK_UNMARK_INTERNAL_ACTION_ID));
    assert.match(markedJson, /open_sample_portal/);
    assert.match(markedJson, /marked internal by <@U1> · cleared 2 unread notifications/);

    const undo = (marked.find((block) => block.type === "actions") as { elements: Array<{ action_id?: string; value?: string }> })
      .elements.find((element) => element.action_id === SLACK_UNMARK_INTERNAL_ACTION_ID);
    const undoAction = findInternalDeviceAction({
      type: "block_actions",
      actions: [{ action_id: SLACK_UNMARK_INTERNAL_ACTION_ID, value: undo?.value }],
    });
    assert.deepEqual(undoAction, { kind: "unmark", value: { deviceId: "dev-123", brandId: "brand-1" } });

    const restored = internalDeviceStatusBlocks(marked, { action: undoAction!, userId: "U2" });
    const restoredJson = JSON.stringify(restored);
    assert.match(restoredJson, new RegExp(`"action_id":"${SLACK_MARK_INTERNAL_ACTION_ID}"`));
    assert.doesNotMatch(restoredJson, new RegExp(SLACK_UNMARK_INTERNAL_ACTION_ID));
    assert.doesNotMatch(restoredJson, /marked internal by/);
    assert.match(restoredJson, /removed from internal list by <@U2>/);
    assert.equal(restored.filter((block) => block.type === "actions").length, 1);
    assert.equal(restored.filter((block) => block.type === "context").length, 1);
  });
});

describe("emitNotification core", () => {
  it("no-ops when disabled", async () => {
    let called = 0;
    await emitNotification(baseEvent, {
      isEnabled: () => false,
      eventAllowed: () => true,
      providers: [
        {
          id: "mock",
          enabled: true,
          send: async () => {
            called += 1;
          },
        },
      ],
    });
    assert.equal(called, 0);
  });

  it("skips phone when filtered", async () => {
    let called = 0;
    await emitNotification(
      { ...baseEvent, channel: "Phone" },
      {
        isEnabled: () => true,
        eventAllowed: (event) => event.channel !== "Phone",
        providers: [
          {
            id: "mock",
            enabled: true,
            send: async () => {
              called += 1;
            },
          },
        ],
      },
    );
    assert.equal(called, 0);
  });

  it("does not throw when a provider fails", async () => {
    let second = 0;
    await emitNotification(baseEvent, {
      isEnabled: () => true,
      eventAllowed: () => true,
      providers: [
        {
          id: "bad",
          enabled: true,
          send: async () => {
            throw new Error("boom");
          },
        },
        {
          id: "good",
          enabled: true,
          send: async () => {
            second += 1;
          },
        },
      ],
    });
    assert.equal(second, 1);
  });
});

describe("slack provider", () => {
  it("posts text + blocks to webhook", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const provider = createSlackWebhookProvider({
      webhookUrl: "https://hooks.slack.com/services/test",
      enabled: true,
      contentMaxChars: 50,
      resolvePortalUrl: () => "https://portal.example/customers/brand-1",
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), body: String(init?.body || "") });
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });
    assert.equal(provider.enabled, true);
    await provider.send(baseEvent);
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0]?.body || "{}") as {
      text: string;
      blocks: unknown[];
    };
    assert.match(payload.text, /Owner: Ella/);
    assert.ok(Array.isArray(payload.blocks));
    assert.ok(payload.blocks.length >= 3);
  });

  it("is disabled without webhook url", () => {
    const provider = createSlackWebhookProvider({ webhookUrl: "", enabled: true });
    assert.equal(provider.enabled, false);
  });
});
