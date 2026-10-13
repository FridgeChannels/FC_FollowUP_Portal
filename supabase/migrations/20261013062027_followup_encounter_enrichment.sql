-- AI-derived Key Changes supplement immutable source notes. Replays never
-- overwrite human-confirmed changes. Uses existing notification storage.
create function public.followup_enrich_encounter(p_brand_id text,p_encounter_id text,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.followup_encounters%rowtype; r public.followup_rounds%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_brand_id,0));
  select * into e from public.followup_encounters where brand_id=p_brand_id and id=p_encounter_id for update;
  if not found then raise exception 'Encounter not found' using errcode='22023'; end if;
  if jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes)>20 then raise exception 'Invalid Key Changes' using errcode='22023'; end if;
  if jsonb_array_length(e.key_changes)>0 or jsonb_array_length(p_changes)=0 then return public.followup_history(p_brand_id); end if;
  if exists(select 1 from jsonb_array_elements(p_changes) c where c->>'type' not in ('Contact','Interest','Objection','Commitment','Outcome') or coalesce(c->>'text','')='' or c->>'source' is distinct from p_encounter_id) then raise exception 'Invalid sourced Key Change' using errcode='22023'; end if;
  update public.followup_encounters set key_changes=p_changes where id=p_encounter_id;
  update public.followup_brand_state set version=version+1 where brand_id=p_brand_id;
  select * into r from public.followup_rounds where id=e.round_id;
  if r.status in ('Active','Paused') and r.assigned_am_id is not null then
    insert into public.system_notifications(type,brand_id,owner_id,title,body,deep_link,dedupe_key)
    values('encounter.updated',p_brand_id,r.assigned_am_id,'New Exhibition information · '||e.exhibition_name,
      (select string_agg(c->>'text', E'\n') from jsonb_array_elements(p_changes) c),
      '/customers/'||p_brand_id||'?followupHistory=1','encounter:'||p_encounter_id)
    on conflict(dedupe_key) do nothing;
  end if;
  return public.followup_history(p_brand_id);
end;
$$;
revoke execute on function public.followup_enrich_encounter(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.followup_enrich_encounter(text,text,jsonb) to service_role;
