import { env } from "cloudflare:workers";

function value(name: "QUO_API_KEY" | "QUO_FROM_NUMBER" | "QUO_WEBHOOK_SIGNING_SECRET" | "QUO_WEBHOOK_SIGNING_SECRETS") {
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

export function getQuoWebhookSigningSecrets() {
  return [...new Set([
    ...String(value("QUO_WEBHOOK_SIGNING_SECRETS") || "").split(","),
    getQuoWebhookSigningSecret() || "",
  ].map((secret) => secret.trim()).filter(Boolean))];
}
