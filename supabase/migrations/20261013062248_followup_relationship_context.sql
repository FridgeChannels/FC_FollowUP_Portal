-- Derived summary updates compare the source version atomically, preventing a
-- slower generation from overwriting context from a newer Encounter.
alter table public.followup_brand_state add column relationship_summary text;
alter table public.followup_brand_state add column summary_version integer;
create or replace function public.followup_history(p_brand_id text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', coalesce((select version from public.followup_brand_state where brand_id=p_brand_id),0),
    'relationshipSummary', (select relationship_summary from public.followup_brand_state where brand_id=p_brand_id),
    'projectionPending', exists(select 1 from public.followup_brand_state where brand_id=p_brand_id and projection is not null),
    'rounds', coalesce((select jsonb_agg(to_jsonb(r) order by round_number desc) from public.followup_rounds r where brand_id=p_brand_id),'[]'::jsonb),
    'encounters', coalesce((select jsonb_agg(to_jsonb(e) - 'original_payload' order by meeting_at asc, id) from public.followup_encounters e where brand_id=p_brand_id),'[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by changed_at asc) from public.followup_assignment_history a join public.followup_rounds r on r.id=a.round_id where r.brand_id=p_brand_id),'[]'::jsonb)
  );
$$;
create function public.followup_save_summary(p_brand_id text,p_content text,p_version integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if length(p_content)>15000 or length(trim(p_content))=0 then raise exception 'Invalid relationship summary' using errcode='22023'; end if;
  update public.followup_brand_state set relationship_summary=p_content,summary_version=p_version
    where brand_id=p_brand_id and version=p_version;
  return found;
end;
$$;
revoke execute on function public.followup_save_summary(text,text,integer) from public, anon, authenticated;
grant execute on function public.followup_save_summary(text,text,integer) to service_role;
