import { env } from "cloudflare:workers";
import { parseSkipUnavailableChannels } from "../channel-availability";

const DEFAULT_FOLLOWUP_CLIENT_DB_ID = "8b04a997-c66f-40dd-8f23-7234450f3c58";
const DEFAULT_FOLLOWUP_OWNER_DB_ID = "3460eaca-0fb1-42da-813a-64a1dc5a39d6";
const DEFAULT_FOLLOWUP_CONTACT_DB_ID = "d67e70b2-230f-4a4e-b8a2-ce79337ee959";
const DEFAULT_KEY_PERSON_DB_ID = "cd09166f-d9fd-836c-864b-073b80032dce";
const DEFAULT_FOLLOWUP_CONVERSATION_DB_ID = "a7ded397-b23f-47f1-a911-3855fc3d10ce";
const DEFAULT_FOLLOWUP_TASK_DB_ID = "ff50607a-3fdd-469e-b5fc-2592a33ff63b";
const DEFAULT_FOLLOWUP_BOMB_DB_ID = "61c87fca-723a-4b52-8fc4-7fa6a8cb55e5";
const DEFAULT_FOLLOWUP_SCENARIO_DB_ID = "a6b464d8-43ec-47c6-8f0f-21e42b224b76";
const DEFAULT_FOLLOWUP_TEMPLATE_DB_ID = "6b8cab86-324d-4d1d-9a8b-8acc48ebc1c5";
const DEFAULT_FOLLOWUP_CAPACITY_DB_ID = "0c422a9a-a10b-4f6f-b87d-b97fbb263dee";
const DEFAULT_FOLLOWUP_CHECKPOINT_DB_ID = "1e1f297c-2925-4903-a0f1-2b6ad113c364";
const DEFAULT_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID = "2ea248ed-37c4-42ec-8591-699f336a3ee7";

export const NOTION_VERSION = "2022-06-28";

export function getFollowupClientDbId() {
  return (
    env.NOTION_FOLLOWUP_CLIENT_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_CLIENT_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_CLIENT_DB_ID
  );
}

export function getFollowupOwnerDbId() {
  return (
    env.NOTION_FOLLOWUP_OWNER_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_OWNER_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_OWNER_DB_ID
  );
}

export function getFollowupConversationDbId() {
  return (
    env.NOTION_FOLLOWUP_CONVERSATION_DB_ID ||
    (typeof process !== "undefined"
      ? process.env.NOTION_FOLLOWUP_CONVERSATION_DB_ID
      : undefined) ||
    DEFAULT_FOLLOWUP_CONVERSATION_DB_ID
  );
}

export function getFollowupTaskDbId() {
  return (
    env.NOTION_FOLLOWUP_TASK_DB_ID ||
    (typeof process !== "undefined"
      ? process.env.NOTION_FOLLOWUP_TASK_DB_ID
      : undefined) ||
    DEFAULT_FOLLOWUP_TASK_DB_ID
  );
}

export function getFollowupContactDbId() {
  return (
    env.NOTION_FOLLOWUP_CONTACT_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_CONTACT_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_CONTACT_DB_ID
  );
}

export function getKeyPersonDbId() {
  return (
    env.NOTION_KEY_PERSON_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_KEY_PERSON_DB_ID : undefined) ||
    DEFAULT_KEY_PERSON_DB_ID
  );
}

export function getFollowupBombDbId() {
  return (
    env.NOTION_FOLLOWUP_BOMB_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_BOMB_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_BOMB_DB_ID
  );
}

export function getFollowupScenarioDbId() {
  return (
    env.NOTION_FOLLOWUP_SCENARIO_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_SCENARIO_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_SCENARIO_DB_ID
  );
}

export function getFollowupTemplateDbId() {
  return (
    env.NOTION_FOLLOWUP_TEMPLATE_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_TEMPLATE_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_TEMPLATE_DB_ID
  );
}

export function getFollowupCapacityDbId() {
  return (
    env.NOTION_FOLLOWUP_CAPACITY_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_CAPACITY_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_CAPACITY_DB_ID
  );
}

export function getFollowupCheckpointDbId() {
  return (
    env.NOTION_FOLLOWUP_CHECKPOINT_DB_ID ||
    (typeof process !== "undefined"
      ? process.env.NOTION_FOLLOWUP_CHECKPOINT_DB_ID
      : undefined) ||
    DEFAULT_FOLLOWUP_CHECKPOINT_DB_ID
  );
}

export function getFollowupLinkedInAccountDbId() {
  return (
    env.NOTION_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID ||
    (typeof process !== "undefined"
      ? process.env.NOTION_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID
      : undefined) ||
    DEFAULT_FOLLOWUP_LINKEDIN_ACCOUNT_DB_ID
  );
}

export function getNotionApiKey() {
  return (
    env.NOTION_API_KEY ||
    (typeof process !== "undefined" ? process.env.NOTION_API_KEY : undefined)
  );
}

export function skipUnavailableChannels() {
  return parseSkipUnavailableChannels(
    env.SKIP_UNAVAILABLE_CHANNELS ||
      (typeof process !== "undefined" ? process.env.SKIP_UNAVAILABLE_CHANNELS : undefined),
    typeof process !== "undefined" && process.env.NODE_ENV === "production",
  );
}

/** Local/test: schedule from now every 5 minutes same day; ignore work window & capacity. */
export function isScheduleTestMode() {
  const raw =
    env.SCHEDULE_TEST_MODE ||
    (typeof process !== "undefined" ? process.env.SCHEDULE_TEST_MODE : undefined);
  return raw != null && /^(1|true|yes|on)$/i.test(String(raw).trim());
}

export function getReplyIngestToken() {
  return (
    env.REPLY_INGEST_TOKEN ||
    (typeof process !== "undefined" ? process.env.REPLY_INGEST_TOKEN : undefined) ||
    ""
  );
}

export function getAdminEmails() {
  const raw =
    env.ADMIN_EMAILS ||
    env.NOTION_ADMIN_EMAILS ||
    (typeof process !== "undefined"
      ? process.env.ADMIN_EMAILS || process.env.NOTION_ADMIN_EMAILS
      : undefined);
  return new Set(
    (raw || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

