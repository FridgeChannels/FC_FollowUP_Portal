/**
 * Node/vinext-start stand-in for workerd's built-in `cloudflare:workers`.
 * Vinext's prod server passes `process.env` into Worker `fetch(env)`, and
 * app code reads bindings via `import { env } from "cloudflare:workers"`.
 */
export const env = process.env;
