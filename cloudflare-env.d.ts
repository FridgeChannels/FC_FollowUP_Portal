declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NOTION_API_KEY?: string;
    NOTION_FOLLOWUP_CLIENT_DB_ID?: string;
    NOTION_FOLLOWUP_OWNER_DB_ID?: string;
    NOTION_FOLLOWUP_CP_DB_ID?: string;
    NOTION_FOLLOWUP_CONTACT_DB_ID?: string;
    NOTION_FOLLOWUP_CONVERSATION_DB_ID?: string;
    NOTION_FOLLOWUP_TASK_DB_ID?: string;
    ADMIN_EMAILS?: string;
    NOTION_ADMIN_EMAILS?: string;
  }
}
