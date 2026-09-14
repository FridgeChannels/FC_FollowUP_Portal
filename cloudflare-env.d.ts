declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NOTION_API_KEY?: string;
    NOTION_FOLLOWUP_CLIENT_DB_ID?: string;
    NOTION_FOLLOWUP_OWNER_DB_ID?: string;
    NOTION_FOLLOWUP_CONTACT_DB_ID?: string;
    NOTION_FOLLOWUP_CONVERSATION_DB_ID?: string;
    NOTION_FOLLOWUP_TASK_DB_ID?: string;
    NOTION_FOLLOWUP_BOMB_DB_ID?: string;
    NOTION_FOLLOWUP_SCENARIO_DB_ID?: string;
    NOTION_FOLLOWUP_TEMPLATE_DB_ID?: string;
    NOTION_FOLLOWUP_CAPACITY_DB_ID?: string;
    NOTION_FOLLOWUP_CHECKPOINT_DB_ID?: string;
    ADMIN_EMAILS?: string;
    NOTION_ADMIN_EMAILS?: string;
    CALLER_EMAILS?: string;
    NOTION_CALLER_EMAILS?: string;
    MOCK_CALLER_TASK_EMAILS?: string;
    SKIP_UNAVAILABLE_CHANNELS?: string;
    REPLY_INGEST_TOKEN?: string;
    QUO_API_KEY?: string;
    QUO_FROM_NUMBER?: string;
    QUO_WEBHOOK_SIGNING_SECRET?: string;
    QUO_WEBHOOK_SIGNING_SECRETS?: string;
  }
}
