import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOpenTrackingToken,
  makeEmailTrackable,
  normalizeOpenTrackingPayload,
  openTrackingPixelUrl,
  parseOpenTrackingToken,
  stripOpenTrackingPixels,
  withOpenTrackingPixel,
} from "./email-tracking.ts";

const SECRET = "test-secret";
const PAYLOAD = {
  b: "brand-a",
  m: "MSG-1-Email",
  t: "THR-1",
  c: "contact-1",
  s: "Quick check on the sample",
};

test("open tracking token round-trips and keeps the subject", async () => {
  const token = await buildOpenTrackingToken(PAYLOAD, SECRET);
  assert.ok(token);
  const parsed = await parseOpenTrackingToken(token, SECRET);
  assert.deepEqual(parsed, PAYLOAD);
});

test("open tracking token cannot be forged without the secret", async () => {
  const token = await buildOpenTrackingToken(PAYLOAD, SECRET);
  assert.ok(token);
  assert.equal(await parseOpenTrackingToken(token, "other-secret"), null);
  // Tampered body, original signature.
  const [version, , signature] = token!.split(".");
  const forged = await buildOpenTrackingToken({ ...PAYLOAD, b: "brand-b" }, SECRET);
  const forgedBody = forged!.split(".")[1];
  assert.equal(await parseOpenTrackingToken(`${version}.${forgedBody}.${signature}`, SECRET), null);
  assert.equal(await parseOpenTrackingToken("garbage", SECRET), null);
  assert.equal(await parseOpenTrackingToken(token, ""), null);
});

test("a token without brand or message is refused", async () => {
  assert.equal(normalizeOpenTrackingPayload({ b: "", m: "MSG-1" }), null);
  assert.equal(normalizeOpenTrackingPayload({ b: "brand-a", m: "" }), null);
  assert.equal(await buildOpenTrackingToken({ b: "brand-a", m: "" }, SECRET), null);
  assert.equal(await buildOpenTrackingToken(PAYLOAD, ""), null);
  // Optional fields stay out of the payload entirely when blank.
  assert.deepEqual(await parseOpenTrackingToken(
    (await buildOpenTrackingToken({ b: "b", m: "m", t: "  ", s: "" }, SECRET))!,
    SECRET,
  ), { b: "b", m: "m" });
});

test("pixel URL needs both a token and a base", () => {
  assert.equal(openTrackingPixelUrl("tok", "https://portal.example/"), "https://portal.example/api/track/open/tok");
  assert.equal(openTrackingPixelUrl("", "https://portal.example"), null);
  assert.equal(openTrackingPixelUrl("tok", ""), null);
});

test("pixel lands in HTML and is stripped again for display", () => {
  const url = "https://portal.example/api/track/open/tok";
  const html = withOpenTrackingPixel("<p>Hello</p>", url);
  assert.ok(html.includes(url));
  assert.ok(html.endsWith(">"));
  // Idempotent: a second pass does not add a second pixel.
  assert.equal(withOpenTrackingPixel(html, url), html);
  const stripped = stripOpenTrackingPixels(html);
  assert.equal(stripped, "<p>Hello</p>");
  assert.ok(!stripOpenTrackingPixels(html).includes("/api/track/open/"));
});

test("plain text is upgraded to HTML so it can carry the pixel", () => {
  const url = "https://portal.example/api/track/open/tok";
  const tracked = makeEmailTrackable("Hi there\n\nSecond <paragraph>", url);
  assert.ok(tracked.includes("<p>Hi there</p>"));
  // Escaped, not injected as markup.
  assert.ok(tracked.includes("&lt;paragraph&gt;"));
  assert.ok(tracked.includes(url));
  // Without a pixel URL, the body is left exactly as authored.
  assert.equal(makeEmailTrackable("<p>Hi</p>", ""), "<p>Hi</p>");
  assert.equal(makeEmailTrackable("", url), "");
});
