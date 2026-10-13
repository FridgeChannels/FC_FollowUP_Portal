/**
 * Open tracking for outbound email.
 *
 * Every email the portal hands to the sender carries a 1x1 pixel that points
 * back at `GET /api/track/open/<token>`. When the recipient's client loads the
 * message body the pixel is fetched, and the route records an `email.opened`
 * raw event (see `./email-open.ts`) which the Signals workspace surfaces as an
 * AM-facing signal.
 *
 * The token is a signed, self-describing payload, so the pixel route can
 * attribute an open to a brand/message without any Notion lookup — it must stay
 * cheap because mail clients fetch it inline.
 *
 * What a pixel hit proves: the image was requested. What it does NOT prove: a
 * human read the message. Mailbox providers (Gmail image proxy, Apple Mail
 * Privacy Protection) prefetch remote images. The Signals UI states this.
 *
 * This module is intentionally dependency-free (no `cloudflare:workers`) so the
 * display layer can import `stripOpenTrackingPixels` from a client component.
 */
import { escapeHtmlText, looksLikeEmailHtml } from "../email-html.ts";

/** Signed payload embedded in the pixel URL. Keys stay short — this travels in a URL. */
export type EmailOpenTokenPayload = {
  /** Follow-up Client brand id. */
  b: string;
  /** Portal Message ID (`MSG-…`); the grouping key for one email's opens. */
  m: string;
  /** Portal Thread ID (`THR-…`) when known. */
  t?: string;
  /** Follow-up Contact id when known. */
  c?: string;
  /** Email subject, truncated — shown on the signal. */
  s?: string;
};

/** Route prefix the pixel points at; also used to recognise our own tag on display. */
export const OPEN_TRACKING_PATH = "/api/track/open";

const TOKEN_VERSION = "eo1";
/** 16 bytes of HMAC-SHA256, hex. Short enough for a URL, long enough to be unguessable. */
const SIGNATURE_HEX_LENGTH = 32;
const SUBJECT_MAX_CHARS = 120;
const PAYLOAD_VALUE_MAX_CHARS = 200;

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison so a wrong signature cannot be probed byte by byte. */
function signaturesMatch(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

function text(value: unknown, max = PAYLOAD_VALUE_MAX_CHARS) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Trim and validate a payload; returns null when it cannot identify a brand + message. */
export function normalizeOpenTrackingPayload(
  input: Partial<EmailOpenTokenPayload> | null | undefined,
): EmailOpenTokenPayload | null {
  const brandId = text(input?.b);
  const messageId = text(input?.m);
  if (!brandId || !messageId) return null;
  const payload: EmailOpenTokenPayload = { b: brandId, m: messageId };
  const threadId = text(input?.t);
  const contactId = text(input?.c);
  const subject = text(input?.s, SUBJECT_MAX_CHARS);
  if (threadId) payload.t = threadId;
  if (contactId) payload.c = contactId;
  if (subject) payload.s = subject;
  return payload;
}

export async function buildOpenTrackingToken(
  payload: Partial<EmailOpenTokenPayload> | null | undefined,
  secret: string | null | undefined,
): Promise<string | null> {
  const normalized = normalizeOpenTrackingPayload(payload);
  const key = (secret || "").trim();
  if (!normalized || !key) return null;
  const body = base64UrlEncode(JSON.stringify(normalized));
  const signature = (await sign(key, body)).slice(0, SIGNATURE_HEX_LENGTH);
  return `${TOKEN_VERSION}.${body}.${signature}`;
}

export async function parseOpenTrackingToken(
  token: string | null | undefined,
  secret: string | null | undefined,
): Promise<EmailOpenTokenPayload | null> {
  const key = (secret || "").trim();
  const parts = (token || "").split(".");
  if (!key || parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
  const expected = (await sign(key, parts[1])).slice(0, SIGNATURE_HEX_LENGTH);
  if (!signaturesMatch(expected, parts[2].toLowerCase())) return null;
  try {
    return normalizeOpenTrackingPayload(JSON.parse(base64UrlDecode(parts[1])));
  } catch {
    return null;
  }
}

/** Absolute pixel URL. Returns null when either half is missing, so callers can skip injection. */
export function openTrackingPixelUrl(
  token: string | null | undefined,
  portalBaseUrl: string | null | undefined,
) {
  const base = (portalBaseUrl || "").replace(/\/+$/, "");
  const value = (token || "").trim();
  if (!base || !value) return null;
  return `${base}${OPEN_TRACKING_PATH}/${value}`;
}

const OPEN_PIXEL_TAG_RE = /<img\b[^>]*\bsrc=["'][^"']*\/api\/track\/open\/[^"']*["'][^>]*>\s*/gi;

export function isOpenTrackingPixelTag(tag: string) {
  return /\/api\/track\/open\//i.test(tag || "");
}

/** Remove our pixel so the portal never renders it — which would self-report an open. */
export function stripOpenTrackingPixels(html: string | null | undefined) {
  return (html || "").replace(OPEN_PIXEL_TAG_RE, "");
}

function plainTextToEmailHtml(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) return escapeHtmlText(normalized);
  return blocks
    .map((block) => `<p>${escapeHtmlText(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Append the pixel. Idempotent, and prefers to land just before `</body>` when present. */
export function withOpenTrackingPixel(
  html: string | null | undefined,
  pixelUrl: string | null | undefined,
) {
  const source = html || "";
  const url = (pixelUrl || "").trim();
  if (!url || source.includes(url)) return source;
  const tag = `<img src="${escapeHtmlText(url)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;outline:none" />`;
  const bodyClose = source.toLowerCase().lastIndexOf("</body>");
  if (bodyClose >= 0) return `${source.slice(0, bodyClose)}${tag}${source.slice(bodyClose)}`;
  return `${source}${tag}`;
}

/**
 * Make any outbound body trackable: HTML gets the pixel appended, plain text is
 * wrapped in a minimal HTML body first (a plain-text message cannot carry an
 * image at all, so tracking it requires the HTML upgrade).
 */
export function makeEmailTrackable(
  content: string | null | undefined,
  pixelUrl: string | null | undefined,
) {
  const source = content || "";
  if (!source.trim() || !(pixelUrl || "").trim()) return source;
  if (looksLikeEmailHtml(source)) return withOpenTrackingPixel(source, pixelUrl);
  return withOpenTrackingPixel(plainTextToEmailHtml(source), pixelUrl);
}
