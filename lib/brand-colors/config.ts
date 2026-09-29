import { env } from "cloudflare:workers";

type BrandColorEnvName = "DTC_DASHBOARD_URL" | "DTC_DASHBOARD_KEY";

function raw(name: BrandColorEnvName): string | undefined {
  const fromCf = (env as Record<string, string | undefined>)[name];
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const value = fromCf || fromProcess;
  return value == null ? undefined : String(value).trim();
}

const DEFAULT_DTC_DASHBOARD_URL = "https://dtc-dashboard.fridgechannels.com";

export function getDtcDashboardUrl() {
  return (raw("DTC_DASHBOARD_URL") || DEFAULT_DTC_DASHBOARD_URL).replace(/\/+$/, "");
}

export function getDtcDashboardKey() {
  return raw("DTC_DASHBOARD_KEY") || "";
}

export function isBrandColorsConfigured() {
  return Boolean(getDtcDashboardKey());
}
