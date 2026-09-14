import { env } from "cloudflare:workers";

function value(name: "QUO_API_KEY" | "QUO_FROM_NUMBER" | "QUO_WEBHOOK_SIGNING_SECRET") {
  return env[name] || (typeof process !== "undefined" ? process.env[name] : undefined);
}

export function getQuoApiKey() {
  return value("QUO_API_KEY");
}

export function getQuoFromNumber() {
  return value("QUO_FROM_NUMBER");
}

export function getQuoWebhookSigningSecret() {
  return value("QUO_WEBHOOK_SIGNING_SECRET");
}
