import { env } from "cloudflare:workers";

function readEnv(name: "WA_PROBE_API_TOKEN" | "WA_API_TOKEN" | "WA_PROBE_BASE_URL") {
  const fromEnv =
    (env as Record<string, string | undefined>)[name] ||
    (typeof process !== "undefined" ? process.env[name] : undefined);
  return fromEnv?.trim() || "";
}

/** Prefer dedicated probe token; fall back to Companion-shared WA_API_TOKEN. */
export function getWaProbeApiToken() {
  return readEnv("WA_PROBE_API_TOKEN") || readEnv("WA_API_TOKEN");
}

export function getWaProbeBaseUrl() {
  return (readEnv("WA_PROBE_BASE_URL") || "https://orch.fcconnect.co").replace(/\/$/, "");
}
