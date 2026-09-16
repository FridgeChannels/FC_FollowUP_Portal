import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

export default defineConfig(async ({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), "");
  const notionApiKey = process.env.NOTION_API_KEY || loadedEnv.NOTION_API_KEY;
  const followupClientDbId =
    process.env.NOTION_FOLLOWUP_CLIENT_DB_ID || loadedEnv.NOTION_FOLLOWUP_CLIENT_DB_ID;
  const followupOwnerDbId =
    process.env.NOTION_FOLLOWUP_OWNER_DB_ID || loadedEnv.NOTION_FOLLOWUP_OWNER_DB_ID;
  const followupContactDbId =
    process.env.NOTION_FOLLOWUP_CONTACT_DB_ID || loadedEnv.NOTION_FOLLOWUP_CONTACT_DB_ID;
  const adminEmails = process.env.ADMIN_EMAILS || loadedEnv.ADMIN_EMAILS;
  const skipUnavailableChannels =
    process.env.SKIP_UNAVAILABLE_CHANNELS || loadedEnv.SKIP_UNAVAILABLE_CHANNELS;
  const scheduleTestMode =
    process.env.SCHEDULE_TEST_MODE || loadedEnv.SCHEDULE_TEST_MODE;
  const replyIngestToken =
    process.env.REPLY_INGEST_TOKEN || loadedEnv.REPLY_INGEST_TOKEN || "local-reply-ingest";
  const quoApiKey = process.env.QUO_API_KEY || loadedEnv.QUO_API_KEY;
  const quoFromNumber = process.env.QUO_FROM_NUMBER || loadedEnv.QUO_FROM_NUMBER;
  const devCallPhone = process.env.DEV_CALL_PHONE || loadedEnv.DEV_CALL_PHONE;
  const quoWebhookKey = process.env.QUO_WEBHOOK_KEY || loadedEnv.QUO_WEBHOOK_KEY;
  const quoWebhookSigningSecret =
    process.env.QUO_WEBHOOK_SIGNING_SECRET || loadedEnv.QUO_WEBHOOK_SIGNING_SECRET;
  const quoWebhookSigningSecrets =
    process.env.QUO_WEBHOOK_SIGNING_SECRETS || loadedEnv.QUO_WEBHOOK_SIGNING_SECRETS;
  const rawDevAllowedHosts =
    process.env.DEV_ALLOWED_HOSTS || loadedEnv.DEV_ALLOWED_HOSTS || "";
  // `true` / `*` / `all` disables Vite host checks (needed for reverse-proxy domains).
  const allowAllDevHosts = ["true", "*", "all"].includes(
    rawDevAllowedHosts.trim().toLowerCase(),
  );
  const devAllowedHosts = allowAllDevHosts
    ? []
    : rawDevAllowedHosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
  const localBindingConfig = {
    main: "vinext/server/fetch-handler",
    compatibility_flags: ["nodejs_compat"],
    vars: {
      ...(notionApiKey ? { NOTION_API_KEY: notionApiKey } : {}),
      ...(followupClientDbId
        ? { NOTION_FOLLOWUP_CLIENT_DB_ID: followupClientDbId }
        : {}),
      ...(followupOwnerDbId
        ? { NOTION_FOLLOWUP_OWNER_DB_ID: followupOwnerDbId }
        : {}),
      ...(followupContactDbId
        ? { NOTION_FOLLOWUP_CONTACT_DB_ID: followupContactDbId }
        : {}),
      ...(adminEmails ? { ADMIN_EMAILS: adminEmails } : {}),
      ...(skipUnavailableChannels
        ? { SKIP_UNAVAILABLE_CHANNELS: skipUnavailableChannels }
        : {}),
      ...(scheduleTestMode ? { SCHEDULE_TEST_MODE: scheduleTestMode } : {}),
      REPLY_INGEST_TOKEN: replyIngestToken,
      ...(quoApiKey ? { QUO_API_KEY: quoApiKey } : {}),
      ...(quoFromNumber ? { QUO_FROM_NUMBER: quoFromNumber } : {}),
      ...(devCallPhone ? { DEV_CALL_PHONE: devCallPhone } : {}),
      ...(quoWebhookKey ? { QUO_WEBHOOK_KEY: quoWebhookKey } : {}),
      ...(quoWebhookSigningSecret
        ? { QUO_WEBHOOK_SIGNING_SECRET: quoWebhookSigningSecret }
        : {}),
      ...(quoWebhookSigningSecrets
        ? { QUO_WEBHOOK_SIGNING_SECRETS: quoWebhookSigningSecrets }
        : {}),
    },
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: "site-creator-d1",
            database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets: r2
      ? [
          {
            binding: r2,
            bucket_name: "site-creator-r2",
          },
        ]
      : [],
  };

  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {
      "import.meta.env.SKIP_UNAVAILABLE_CHANNELS": JSON.stringify(
        skipUnavailableChannels ?? "",
      ),
      "import.meta.env.DEV_CALL_PHONE": JSON.stringify(devCallPhone ?? ""),
    },
    server: {
      ...(managedLinux ? { host: "0.0.0.0" } : {}),
      ...(allowAllDevHosts
        ? { allowedHosts: true }
        : managedLinux || devAllowedHosts.length
          ? {
              allowedHosts: [
                ...new Set([
                  ...(managedLinux ? ["terminal.local"] : []),
                  ...devAllowedHosts,
                ]),
              ],
            }
          : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
