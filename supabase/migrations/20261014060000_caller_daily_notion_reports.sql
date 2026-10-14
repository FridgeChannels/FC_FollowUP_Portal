-- Caller × civil-day registration of the daily Notion report URL.
-- Identifiers reuse OwnerDB Notion page IDs (same as viewer.ownerId).
create table public.caller_daily_notion_reports (
  id uuid primary key default gen_random_uuid(),
  caller_id text not null,
  caller_name text not null,
  report_date date not null,
  notion_page_id text not null,
  notion_url text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (caller_id, report_date)
);

create index caller_daily_notion_reports_caller_date
  on public.caller_daily_notion_reports (caller_id, report_date desc);

alter table public.caller_daily_notion_reports enable row level security;
revoke all on public.caller_daily_notion_reports from anon, authenticated;
grant all on public.caller_daily_notion_reports to service_role;
