import { env } from "cloudflare:workers";

type PosthogEnvName = "POSTHOG_HOST" | "POSTHOG_PERSONAL_API_KEY" | "POSTHOG_PROJECT_ID";

function raw(name: PosthogEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

const DEFAULT_HOST = "https://us.posthog.com";
const DEFAULT_PROJECT_ID = "550339";

export function getPosthogHost() {
  return (raw("POSTHOG_HOST") || DEFAULT_HOST).replace(/\/+$/, "");
}

export function getPosthogPersonalApiKey() {
  return raw("POSTHOG_PERSONAL_API_KEY") || "";
}

export function getPosthogProjectId() {
  return raw("POSTHOG_PROJECT_ID") || DEFAULT_PROJECT_ID;
}

export function isPosthogConfigured() {
  return Boolean(getPosthogPersonalApiKey() && getPosthogProjectId());
}
