import { env } from "cloudflare:workers";

function readEnv(name: "ICYPEAS_API_KEY" | "ICYPEAS_ACCOUNT_EMAIL") {
  const fromEnv =
    (env as Record<string, string | undefined>)[name] ||
    (typeof process !== "undefined" ? process.env[name] : undefined);
  return fromEnv?.trim() || "";
}

export function getIcypeasApiKey() {
  return readEnv("ICYPEAS_API_KEY");
}

export function getIcypeasAccountEmail() {
  return readEnv("ICYPEAS_ACCOUNT_EMAIL");
}
