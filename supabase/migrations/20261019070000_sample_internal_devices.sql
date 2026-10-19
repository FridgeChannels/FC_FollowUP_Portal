-- Global PostHog device allowlist. A single device can produce taps for many
-- brands, so both allowlist updates and historical visit flags are global.
create table if not exists public.sample_internal_devices (
  device_id text primary key,
  label text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sample_internal_devices_created_at_idx
  on public.sample_internal_devices (created_at desc);
create index if not exists sample_tap_visits_device_id_idx
  on public.sample_tap_visits (device_id)
  where device_id is not null;

alter table public.sample_internal_devices enable row level security;
revoke all on public.sample_internal_devices from anon, authenticated;
grant all on public.sample_internal_devices to service_role;

-- Keep the allowlist row and every matching tap's is_internal snapshot in sync
-- as one transaction. The server calls this RPC with its service-role client.
create or replace function public.set_sample_internal_device(
  p_device_id text,
  p_is_internal boolean,
  p_label text default null,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_device public.sample_internal_devices%rowtype;
  v_device_id text := btrim(p_device_id);
begin
  if v_device_id is null or length(v_device_id) not between 1 and 256 then
    raise exception 'device_id must be 1–256 characters' using errcode = '22023';
  end if;

  if p_is_internal then
    insert into public.sample_internal_devices (device_id, label, note, updated_at)
    values (v_device_id, nullif(btrim(p_label), ''), nullif(btrim(p_note), ''), now())
    on conflict (device_id) do update
      set label = excluded.label,
          note = excluded.note,
          updated_at = now()
    returning * into v_device;

    update public.sample_tap_visits
      set is_internal = true
      where device_id = v_device_id and is_internal is distinct from true;

    return to_jsonb(v_device);
  end if;

  delete from public.sample_internal_devices where device_id = v_device_id;
  update public.sample_tap_visits
    set is_internal = false
    where device_id = v_device_id and is_internal is distinct from false;

  return jsonb_build_object('device_id', v_device_id, 'is_internal', false);
end;
$$;

revoke all on function public.set_sample_internal_device(text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_sample_internal_device(text, boolean, text, text)
  to service_role;
