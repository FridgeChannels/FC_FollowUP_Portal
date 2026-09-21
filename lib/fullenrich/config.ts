import { env } from "cloudflare:workers";

function readEnv(name: "FULLENRICH_API_KEY") {
  const fromEnv =
    (env as Record<string, string | undefined>)[name] ||
    (typeof process !== "undefined" ? process.env[name] : undefined);
  return fromEnv?.trim() || "";
}

export function getFullenrichApiKey() {
  return readEnv("FULLENRICH_API_KEY");
}
