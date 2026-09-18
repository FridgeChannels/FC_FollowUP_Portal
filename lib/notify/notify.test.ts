import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emitNotification } from "./core.ts";
import {
  formatSlackNotificationBlocks,
  formatSlackNotificationText,
  truncatePreview,
} from "./format.ts";
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
