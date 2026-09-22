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
  const clientDbId = process.env.NOTION_CLIENT_DB_ID || loadedEnv.NOTION_CLIENT_DB_ID;
  const exhibitionDbId =
    process.env.NOTION_EXHIBITION_DB_ID || loadedEnv.NOTION_EXHIBITION_DB_ID;
  const followupOwnerDbId =
    process.env.NOTION_FOLLOWUP_OWNER_DB_ID || loadedEnv.NOTION_FOLLOWUP_OWNER_DB_ID;
  const followupContactDbId =
    process.env.NOTION_FOLLOWUP_CONTACT_DB_ID || loadedEnv.NOTION_FOLLOWUP_CONTACT_DB_ID;
  const keyPersonDbId =
    process.env.NOTION_KEY_PERSON_DB_ID || loadedEnv.NOTION_KEY_PERSON_DB_ID;
  const followupMeetingListPageId =
    process.env.NOTION_FOLLOWUP_MEETING_LIST_PAGE_ID ||
    loadedEnv.NOTION_FOLLOWUP_MEETING_LIST_PAGE_ID;
  const adminEmails = process.env.ADMIN_EMAILS || loadedEnv.ADMIN_EMAILS;
  const skipUnavailableChannels =
    process.env.SKIP_UNAVAILABLE_CHANNELS || loadedEnv.SKIP_UNAVAILABLE_CHANNELS;
  const scheduleTestMode =
    process.env.SCHEDULE_TEST_MODE || loadedEnv.SCHEDULE_TEST_MODE;
  const replyIngestToken =
    process.env.REPLY_INGEST_TOKEN || loadedEnv.REPLY_INGEST_TOKEN || "local-reply-ingest";
  const notifyEnabled = process.env.NOTIFY_ENABLED || loadedEnv.NOTIFY_ENABLED;
  const notifySlackEnabled =
    process.env.NOTIFY_SLACK_ENABLED || loadedEnv.NOTIFY_SLACK_ENABLED;
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || loadedEnv.SLACK_WEBHOOK_URL;
  const notifyOnReply = process.env.NOTIFY_ON_REPLY || loadedEnv.NOTIFY_ON_REPLY;
  const notifyOnInbound = process.env.NOTIFY_ON_INBOUND || loadedEnv.NOTIFY_ON_INBOUND;
  const notifyOnPhone = process.env.NOTIFY_ON_PHONE || loadedEnv.NOTIFY_ON_PHONE;
  const notifyContentMaxChars =
    process.env.NOTIFY_CONTENT_MAX_CHARS || loadedEnv.NOTIFY_CONTENT_MAX_CHARS;
  const portalBaseUrl = process.env.PORTAL_BASE_URL || loadedEnv.PORTAL_BASE_URL;
  const quoApiKey = process.env.QUO_API_KEY || loadedEnv.QUO_API_KEY;
  const quoFromNumber = process.env.QUO_FROM_NUMBER || loadedEnv.QUO_FROM_NUMBER;
  const devCallPhone = process.env.DEV_CALL_PHONE || loadedEnv.DEV_CALL_PHONE;
  const quoWebhookKey = process.env.QUO_WEBHOOK_KEY || loadedEnv.QUO_WEBHOOK_KEY;
  const quoWebhookSigningSecret =
    process.env.QUO_WEBHOOK_SIGNING_SECRET || loadedEnv.QUO_WEBHOOK_SIGNING_SECRET;
  const quoWebhookSigningSecrets =
    process.env.QUO_WEBHOOK_SIGNING_SECRETS || loadedEnv.QUO_WEBHOOK_SIGNING_SECRETS;
  const displayTimeZone =
    process.env.DISPLAY_TIME_ZONE ||
    loadedEnv.DISPLAY_TIME_ZONE ||
    "America/New_York";
  const senderName = process.env.SENDER_NAME || loadedEnv.SENDER_NAME || "";
  const icypeasApiKey = process.env.ICYPEAS_API_KEY || loadedEnv.ICYPEAS_API_KEY;
  const icypeasAccountEmail =
    process.env.ICYPEAS_ACCOUNT_EMAIL || loadedEnv.ICYPEAS_ACCOUNT_EMAIL;
  const fullenrichApiKey =
    process.env.FULLENRICH_API_KEY || loadedEnv.FULLENRICH_API_KEY;
  const waProbeApiToken =
    process.env.WA_PROBE_API_TOKEN || loadedEnv.WA_PROBE_API_TOKEN;
  const waApiToken = process.env.WA_API_TOKEN || loadedEnv.WA_API_TOKEN;
  const waProbeBaseUrl =
    process.env.WA_PROBE_BASE_URL || loadedEnv.WA_PROBE_BASE_URL;
  const awsAccessKeyId =
    process.env.AWS_ACCESS_KEY_ID || loadedEnv.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || loadedEnv.AWS_SECRET_ACCESS_KEY;
  const awsDefaultRegion =
    process.env.AWS_DEFAULT_REGION || loadedEnv.AWS_DEFAULT_REGION;
  const s3Bucket = process.env.S3_BUCKET || loadedEnv.S3_BUCKET;
  const s3KeyPrefix = process.env.S3_KEY_PREFIX || loadedEnv.S3_KEY_PREFIX;
  const s3VideoPrefix = process.env.S3_VIDEO_PREFIX || loadedEnv.S3_VIDEO_PREFIX;
  const s3CreatorPrefix =
    process.env.S3_CREATOR_PREFIX || loadedEnv.S3_CREATOR_PREFIX;
  const s3FilePrefix = process.env.S3_FILE_PREFIX || loadedEnv.S3_FILE_PREFIX;
  const emailAttachmentMimeTypes =
    process.env.EMAIL_ATTACHMENT_MIME_TYPES || loadedEnv.EMAIL_ATTACHMENT_MIME_TYPES;
  const emailAttachmentMaxBytes =
    process.env.EMAIL_ATTACHMENT_MAX_BYTES || loadedEnv.EMAIL_ATTACHMENT_MAX_BYTES;
  const emailAttachmentMaxCount =
    process.env.EMAIL_ATTACHMENT_MAX_COUNT || loadedEnv.EMAIL_ATTACHMENT_MAX_COUNT;
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
      ...(clientDbId ? { NOTION_CLIENT_DB_ID: clientDbId } : {}),
      ...(exhibitionDbId ? { NOTION_EXHIBITION_DB_ID: exhibitionDbId } : {}),
      ...(followupOwnerDbId
        ? { NOTION_FOLLOWUP_OWNER_DB_ID: followupOwnerDbId }
        : {}),
      ...(followupContactDbId
        ? { NOTION_FOLLOWUP_CONTACT_DB_ID: followupContactDbId }
        : {}),
      ...(keyPersonDbId ? { NOTION_KEY_PERSON_DB_ID: keyPersonDbId } : {}),
      ...(followupMeetingListPageId
        ? { NOTION_FOLLOWUP_MEETING_LIST_PAGE_ID: followupMeetingListPageId }
        : {}),
      ...(adminEmails ? { ADMIN_EMAILS: adminEmails } : {}),
      ...(skipUnavailableChannels
        ? { SKIP_UNAVAILABLE_CHANNELS: skipUnavailableChannels }
        : {}),
      ...(scheduleTestMode ? { SCHEDULE_TEST_MODE: scheduleTestMode } : {}),
      REPLY_INGEST_TOKEN: replyIngestToken,
      ...(notifyEnabled ? { NOTIFY_ENABLED: notifyEnabled } : {}),
      ...(notifySlackEnabled ? { NOTIFY_SLACK_ENABLED: notifySlackEnabled } : {}),
      ...(slackWebhookUrl ? { SLACK_WEBHOOK_URL: slackWebhookUrl } : {}),
      ...(notifyOnReply ? { NOTIFY_ON_REPLY: notifyOnReply } : {}),
      ...(notifyOnInbound ? { NOTIFY_ON_INBOUND: notifyOnInbound } : {}),
      ...(notifyOnPhone ? { NOTIFY_ON_PHONE: notifyOnPhone } : {}),
      ...(notifyContentMaxChars
        ? { NOTIFY_CONTENT_MAX_CHARS: notifyContentMaxChars }
        : {}),
      ...(portalBaseUrl ? { PORTAL_BASE_URL: portalBaseUrl } : {}),
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
      DISPLAY_TIME_ZONE: displayTimeZone,
      ...(senderName ? { SENDER_NAME: senderName } : {}),
      ...(icypeasApiKey ? { ICYPEAS_API_KEY: icypeasApiKey } : {}),
      ...(icypeasAccountEmail ? { ICYPEAS_ACCOUNT_EMAIL: icypeasAccountEmail } : {}),
      ...(fullenrichApiKey ? { FULLENRICH_API_KEY: fullenrichApiKey } : {}),
      ...(waProbeApiToken ? { WA_PROBE_API_TOKEN: waProbeApiToken } : {}),
      ...(waApiToken ? { WA_API_TOKEN: waApiToken } : {}),
      ...(waProbeBaseUrl ? { WA_PROBE_BASE_URL: waProbeBaseUrl } : {}),
      ...(awsAccessKeyId ? { AWS_ACCESS_KEY_ID: awsAccessKeyId } : {}),
      ...(awsSecretAccessKey
        ? { AWS_SECRET_ACCESS_KEY: awsSecretAccessKey }
        : {}),
      ...(awsDefaultRegion ? { AWS_DEFAULT_REGION: awsDefaultRegion } : {}),
      ...(s3Bucket ? { S3_BUCKET: s3Bucket } : {}),
      ...(s3KeyPrefix ? { S3_KEY_PREFIX: s3KeyPrefix } : {}),
      ...(s3VideoPrefix ? { S3_VIDEO_PREFIX: s3VideoPrefix } : {}),
      ...(s3CreatorPrefix ? { S3_CREATOR_PREFIX: s3CreatorPrefix } : {}),
      ...(s3FilePrefix ? { S3_FILE_PREFIX: s3FilePrefix } : {}),
      ...(emailAttachmentMimeTypes
        ? { EMAIL_ATTACHMENT_MIME_TYPES: emailAttachmentMimeTypes }
        : {}),
      ...(emailAttachmentMaxBytes
        ? { EMAIL_ATTACHMENT_MAX_BYTES: emailAttachmentMaxBytes }
        : {}),
      ...(emailAttachmentMaxCount
        ? { EMAIL_ATTACHMENT_MAX_COUNT: emailAttachmentMaxCount }
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
    optimizeDeps: {
      // AWS SDK browser chunks break Vite RSC dep optimization in this stack.
      exclude: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
    },
    define: {
      "import.meta.env.SKIP_UNAVAILABLE_CHANNELS": JSON.stringify(
        skipUnavailableChannels ?? "",
      ),
      "import.meta.env.DEV_CALL_PHONE": JSON.stringify(devCallPhone ?? ""),
      "import.meta.env.DISPLAY_TIME_ZONE": JSON.stringify(displayTimeZone),
      "import.meta.env.SENDER_NAME": JSON.stringify(senderName),
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
