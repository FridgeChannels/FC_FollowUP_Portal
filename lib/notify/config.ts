import { env } from "cloudflare:workers";

type NotifyEnvName =
  | "NOTIFY_ENABLED"
  | "NOTIFY_SLACK_ENABLED"
  | "SLACK_WEBHOOK_URL"
  | "NOTIFY_ON_REPLY"
  | "NOTIFY_ON_INBOUND"
  | "NOTIFY_ON_PHONE"
  | "NOTIFY_CONTENT_MAX_CHARS"
  | "PORTAL_BASE_URL";

function raw(name: NotifyEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess =
    typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

function asBool(value: string | undefined, defaultValue: boolean) {
  if (value == null || value === "") return defaultValue;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  return defaultValue;
}

const DEFAULT_PORTAL_BASE_URL = "https://followup-portal.fridgechannels.com";

export function isNotifyEnabled() {
  return asBool(raw("NOTIFY_ENABLED"), false);
}

export function isSlackNotifyEnabled() {
  return asBool(raw("NOTIFY_SLACK_ENABLED"), true);
}

export function getSlackWebhookUrl() {
  return raw("SLACK_WEBHOOK_URL") || "";
}

export function shouldNotifyReply() {
  return asBool(raw("NOTIFY_ON_REPLY"), true);
}

export function shouldNotifyInbound() {
  return asBool(raw("NOTIFY_ON_INBOUND"), true);
}

export function shouldNotifyPhone() {
  return asBool(raw("NOTIFY_ON_PHONE"), true);
}

export function getNotifyContentMaxChars() {
  const parsed = Number(raw("NOTIFY_CONTENT_MAX_CHARS") || "300");
  if (!Number.isFinite(parsed) || parsed <= 0) return 300;
  return Math.floor(parsed);
}

/** Portal origin for brand deep links (`/customers/{brandId}`). */
export function getPortalBaseUrl() {
  const value = raw("PORTAL_BASE_URL") || DEFAULT_PORTAL_BASE_URL;
  return value.replace(/\/+$/, "");
}

export function portalBrandUrl(brandId: string | null | undefined) {
  const id = (brandId || "").trim();
  if (!id) return null;
  return `${getPortalBaseUrl()}/customers/${encodeURIComponent(id)}`;
}

export function eventTypeEnabled(eventType: "reply.received" | "inbound.received") {
  if (eventType === "reply.received") return shouldNotifyReply();
  return shouldNotifyInbound();
}
