import { env } from "cloudflare:workers";

const DEFAULT_FOLLOWUP_CLIENT_DB_ID = "8b04a997-c66f-40dd-8f23-7234450f3c58";
const DEFAULT_FOLLOWUP_OWNER_DB_ID = "3460eaca-0fb1-42da-813a-64a1dc5a39d6";
const DEFAULT_FOLLOWUP_CP_DB_ID = "606a77cc-978a-40fb-869d-08919a433c6f";
const DEFAULT_FOLLOWUP_CONTACT_DB_ID = "d67e70b2-230f-4a4e-b8a2-ce79337ee959";
const DEFAULT_FOLLOWUP_CONVERSATION_DB_ID = "a7ded397-b23f-47f1-a911-3855fc3d10ce";
const DEFAULT_FOLLOWUP_TASK_DB_ID = "ff50607a-3fdd-469e-b5fc-2592a33ff63b";

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

export function getFollowupCpDbId() {
  return (
    env.NOTION_FOLLOWUP_CP_DB_ID ||
    (typeof process !== "undefined" ? process.env.NOTION_FOLLOWUP_CP_DB_ID : undefined) ||
    DEFAULT_FOLLOWUP_CP_DB_ID
  );
}

export function getNotionApiKey() {
  return (
    env.NOTION_API_KEY ||
    (typeof process !== "undefined" ? process.env.NOTION_API_KEY : undefined)
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
