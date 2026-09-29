-- Applied via Supabase migration: followup_sample_tap_tracking
-- Portal sample tap sync tables (PostHog → local store → system notifications)

CREATE TABLE IF NOT EXISTS public.sample_tap_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sn text NOT NULL,
  brand_id text,
  posthog_event_uuid text NOT NULL,
  occurred_at timestamptz NOT NULL,
  device_id text,
  distinct_id text,
  pathname text,
  url text,
  geo_city text,
  geo_country text,
  browser text,
  os text,
  referrer text,
  is_internal boolean NOT NULL DEFAULT false,
  -- Snapshot of magnet_brand_param.experience at first sync: dtc | asin_plus
  experience text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sample_tap_visits_posthog_event_uuid_key UNIQUE (posthog_event_uuid)
);

CREATE INDEX IF NOT EXISTS sample_tap_visits_brand_id_occurred_at_idx
  ON public.sample_tap_visits (brand_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sample_tap_visits_sn_occurred_at_idx
  ON public.sample_tap_visits (sn, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sample_tap_visits_sn_experience_occurred_at_idx
  ON public.sample_tap_visits (sn, experience, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.sample_sync_cursors (
  sn text PRIMARY KEY,
  brand_id text,
  last_event_at timestamptz,
  last_run_at timestamptz,
  status text NOT NULL DEFAULT 'idle',
  error text
);

CREATE TABLE IF NOT EXISTS public.system_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  brand_id text NOT NULL,
  owner_id text,
  title text NOT NULL,
  body text,
  deep_link text,
  dedupe_key text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_notifications_dedupe_key_key UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS system_notifications_brand_id_created_at_idx
  ON public.system_notifications (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS system_notifications_owner_unread_idx
  ON public.system_notifications (owner_id, created_at DESC)
  WHERE read_at IS NULL;

-- Internal PostHog $device_id allowlist (skip Slack notify, mark visits as internal)
CREATE TABLE IF NOT EXISTS public.sample_internal_devices (
  device_id text PRIMARY KEY,
  label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sample_internal_devices_created_at_idx
  ON public.sample_internal_devices (created_at DESC);

ALTER TABLE public.sample_tap_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sample_internal_devices ENABLE ROW LEVEL SECURITY;
