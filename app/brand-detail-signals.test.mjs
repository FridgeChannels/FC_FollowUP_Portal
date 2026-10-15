import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const notifications = {};
runInNewContext(compile("../lib/signals/notifications.ts"), {
  exports: notifications, require: () => ({ parseTimelineMs: Date.parse }),
});
const exports = {};
runInNewContext(compile("./brand-detail-signals.tsx"), {
  exports,
  require: name => {
    if (name === "react" || name === "react/jsx-runtime" || name === "lucide-react") return require(name);
    if (name.endsWith("/notifications")) return notifications;
    if (name.endsWith("/display-time")) return { formatScheduledDateTime: value => value };
    if (name.endsWith("/model")) return { safeSourceUrl: value => /^https?:\/\//.test(value || "") ? value : undefined };
    if (name === "./channel-icon") return { ChannelIcon: () => null };
    return {};
  },
});
const event = (id, type, patch = {}) => ({
  id, type, brandId: "brand", summary: `${type} summary`, highPriority: false,
  occurredAt: "2026-10-15T12:00:00Z", detectedAt: "2026-10-15T12:00:00Z", ...patch,
});
const render = props => renderToStaticMarkup(React.createElement(exports.ImportantSignalsPanel, { readIds: [], ...props }));

test("LinkedIn notifications link directly to the original post in a new tab", () => {
  const sourceUrl = "https://www.linkedin.com/posts/company_original-post-123";
  const html = render({ events: [event("post", "linkedin", { sourceUrl })] });
  assert.match(html, new RegExp(`href="${sourceUrl}" target="_blank"`));
  assert.match(html, /View LinkedIn post/);
  assert.doesNotMatch(html, /Signal History/);
});

test("Email Open notifications expose an email action and never a history action", () => {
  const html = render({ events: [event("open", "email", { subject: "Exact email" })] });
  assert.match(html, /<button[^>]*>/);
  assert.match(html, /Open email/);
  assert.doesNotMatch(html, /View details|Signal History/);
});

test("Tap details expand inline and remain available while the read notification is expanded", () => {
  const sample = event("tap", "sample", { sampleId: "SN-1", tapLocation: "United States" });
  const expanded = render({ events: [sample], readIds: ["tap"], initialSampleSignalId: "tap", brandName: "Brand", ownerName: "Owner" });
  assert.match(expanded, /aria-expanded="true"/);
  assert.match(expanded, /Sample tap details/);
  assert.match(expanded, /United States/);
  assert.match(expanded, /Close details/);
  assert.doesNotMatch(expanded, /Signal History/);
  assert.equal(render({ events: [sample], readIds: ["tap"] }), "");
});

test("unread Tap notifications are visible without expanded details", () => {
  const html = render({ events: [event("tap", "sample", { sampleId: "SN-1" })] });
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /Unread/);
  assert.doesNotMatch(html, /Sample tap details/);
});
