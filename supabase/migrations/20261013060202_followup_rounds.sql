-- Additive service-only storage. Brand/AM/CP identifiers are existing Notion IDs.
create table public.followup_brand_state (
  brand_id text primary key,
  client_id text unique,
  version integer not null default 0,
  projection jsonb,
  projection_token uuid,
  projection_claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.followup_rounds (
  id uuid primary key default gen_random_uuid(),
  brand_id text not null references public.followup_brand_state(brand_id),
  round_number integer not null check (round_number > 0),
  status text not null check (status in ('Active','Paused','Completed')),
  assigned_am_id text,
  assigned_am_name text,
  origin_encounter_id text,
  current_cp text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  paused_reason text,
  outcome text,
  migrated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, round_number),
  unique (brand_id, id)
);
create unique index followup_one_unfinished_round on public.followup_rounds(brand_id) where status in ('Active','Paused');
create table public.followup_encounters (
  id text primary key,
  brand_id text not null references public.followup_brand_state(brand_id),
  exhibition_id text not null,
  exhibition_name text not null,
  round_id uuid,
  meeting_at timestamptz not null,
  met_by text not null,
  meeting_notes text not null,
  key_changes jsonb not null default '[]'::jsonb check (jsonb_typeof(key_changes) = 'array'),
  next_step text,
  meeting_record_url text,
  original_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (brand_id, id),
  foreign key (brand_id, round_id) references public.followup_rounds(brand_id, id)
);
create index followup_encounters_brand on public.followup_encounters(brand_id, meeting_at);
create index followup_encounters_round on public.followup_encounters(round_id);
alter table public.followup_rounds add constraint followup_round_origin foreign key (brand_id, origin_encounter_id) references public.followup_encounters(brand_id, id);
create table public.followup_assignment_history (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.followup_rounds(id),
  previous_am_id text,
  previous_am_name text,
  new_am_id text,
  new_am_name text,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
create index followup_assignments_round on public.followup_assignment_history(round_id, changed_at);

alter table public.followup_brand_state enable row level security;
alter table public.followup_rounds enable row level security;
alter table public.followup_encounters enable row level security;
alter table public.followup_assignment_history enable row level security;
revoke all on public.followup_brand_state, public.followup_rounds, public.followup_encounters, public.followup_assignment_history from anon, authenticated;
grant all on public.followup_brand_state, public.followup_rounds, public.followup_encounters, public.followup_assignment_history to service_role;

create function public.followup_history(p_brand_id text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', coalesce((select version from public.followup_brand_state where brand_id=p_brand_id),0),
    'projectionPending', exists(select 1 from public.followup_brand_state where brand_id=p_brand_id and projection is not null),
    'rounds', coalesce((select jsonb_agg(to_jsonb(r) order by round_number desc) from public.followup_rounds r where brand_id=p_brand_id),'[]'::jsonb),
    'encounters', coalesce((select jsonb_agg(to_jsonb(e) - 'original_payload' order by meeting_at asc, id) from public.followup_encounters e where brand_id=p_brand_id),'[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a) order by changed_at asc) from public.followup_assignment_history a join public.followup_rounds r on r.id=a.round_id where r.brand_id=p_brand_id),'[]'::jsonb)
  );
$$;

-- Every mutation locks the same canonical brand. The unique partial index is a
-- second line of defense. An immutable encounter ID is global across retries.
create function public.followup_mutate(p_brand_id text, p_action text, p_payload jsonb, p_seed jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r public.followup_rounds%rowtype;
  e public.followup_encounters%rowtype;
  s public.followup_brand_state%rowtype;
  v_status text;
  v_owner text;
  v_owner_name text;
  v_cp text;
  v_round_number integer;
  v_projection jsonb;
  v_at timestamptz := now();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_brand_id, 0));
  insert into public.followup_brand_state(brand_id,client_id)
    values(p_brand_id,nullif(p_seed->>'clientId','')) on conflict (brand_id) do nothing;
  select * into s from public.followup_brand_state where brand_id=p_brand_id for update;
  if not exists(select 1 from public.followup_rounds where brand_id=p_brand_id)
     and p_seed->>'status' in ('In Progress','Paused','Completed','Terminated') and s.version=0 then
    insert into public.followup_rounds(brand_id,round_number,status,assigned_am_id,assigned_am_name,current_cp,started_at,migrated)
    values(p_brand_id,1,case when p_seed->>'status'='Paused' then 'Paused' when p_seed->>'status' in ('Completed','Terminated') then 'Completed' else 'Active' end,
      nullif(p_seed->>'ownerId',''),nullif(p_seed->>'ownerName',''),nullif(p_seed->>'currentCpId',''),
      nullif(p_seed->>'startedAt','')::timestamptz,true);
  end if;
  if p_action='seed' then return public.followup_history(p_brand_id); end if;
  if s.projection is not null then raise exception 'Follow-up synchronization pending; retry shortly' using errcode='P0001'; end if;
  if p_payload ? 'expectedVersion' and (p_payload->>'expectedVersion')::integer <> s.version then
    raise exception 'Follow-up changed; refresh and retry' using errcode='P0001';
  end if;
  select * into r from public.followup_rounds where brand_id=p_brand_id order by round_number desc limit 1 for update;
  if p_payload ? 'expectedRoundId' and coalesce(p_payload->>'expectedRoundId','') <> coalesce(r.id::text,'') then
    raise exception 'Round changed; refresh and retry' using errcode='P0001';
  end if;

  if p_action='encounter' then
    select * into e from public.followup_encounters where id=p_payload->>'id';
    if found then
      if e.brand_id<>p_brand_id or e.original_payload<>p_payload then
        raise exception 'Encounter ID already exists with different data' using errcode='P0001';
      end if;
      return public.followup_history(p_brand_id) || jsonb_build_object('duplicate',true);
    end if;
    if nullif(p_payload->>'id','') is null or nullif(p_payload->>'exhibitionId','') is null
      or nullif(p_payload->>'metBy','') is null or nullif(p_payload->>'meetingAt','') is null then
      raise exception 'Invalid encounter' using errcode='22023';
    end if;
    insert into public.followup_encounters(id,brand_id,exhibition_id,exhibition_name,round_id,meeting_at,met_by,meeting_notes,key_changes,next_step,meeting_record_url,original_payload)
    values(p_payload->>'id',p_brand_id,p_payload->>'exhibitionId',p_payload->>'exhibitionName',
      case when r.status in ('Active','Paused') and not coalesce((p_payload->>'historical')::boolean,false) then r.id else null end,
      (p_payload->>'meetingAt')::timestamptz,p_payload->>'metBy',coalesce(p_payload->>'meetingNotes',''),
      coalesce(p_payload->'keyChanges','[]'::jsonb),nullif(p_payload->>'nextStep',''),nullif(p_payload->>'meetingRecordUrl',''),p_payload);
    if jsonb_array_length(coalesce(p_payload->'keyChanges','[]'::jsonb))>0 and r.status in ('Active','Paused') and r.assigned_am_id is not null then
      insert into public.system_notifications(type,brand_id,owner_id,title,body,deep_link,dedupe_key)
      values('encounter.updated',p_brand_id,r.assigned_am_id,'New Exhibition information · '||(p_payload->>'exhibitionName'),
        (select string_agg(value->>'text', E'\n') from jsonb_array_elements(p_payload->'keyChanges')),
        '/customers/'||p_brand_id||'?followupHistory=1','encounter:'||(p_payload->>'id'))
      on conflict (dedupe_key) do nothing;
    end if;
  elsif p_action in ('start','resume','patch') then
    if p_action='start' then
      if r.status in ('Active','Paused') then raise exception 'An unfinished Round already exists' using errcode='P0001'; end if;
      if nullif(p_payload->>'originEncounterId','') is not null and not exists(select 1 from public.followup_encounters where id=p_payload->>'originEncounterId' and brand_id=p_brand_id and round_id is null) then
        raise exception 'Origin Encounter must belong to this Brand and have no Round' using errcode='22023';
      end if;
      v_owner := case when p_payload ? 'ownerId' then nullif(p_payload->>'ownerId','') else coalesce(r.assigned_am_id,nullif(p_seed->>'ownerId','')) end;
      v_owner_name := case when p_payload ? 'ownerId' then nullif(p_payload->>'ownerName','') else coalesce(r.assigned_am_name,nullif(p_seed->>'ownerName','')) end;
      v_round_number := coalesce(r.round_number,0)+1;
      insert into public.followup_rounds(brand_id,round_number,status,assigned_am_id,assigned_am_name,origin_encounter_id,current_cp,started_at)
      values(p_brand_id,v_round_number,'Active',v_owner,v_owner_name,nullif(p_payload->>'originEncounterId',''),null,v_at) returning * into r;
      update public.followup_encounters set round_id=r.id where id=r.origin_encounter_id and brand_id=p_brand_id;
      v_projection := jsonb_build_object('ownerId',v_owner,'currentCpId',null,'status',case when v_owner is null then 'Unassigned' else 'In Progress' end,'newAssignment',true);
    elsif p_action='resume' then
      if r.status is distinct from 'Paused' then raise exception 'Only a Paused Round can Resume' using errcode='P0001'; end if;
      update public.followup_rounds set status='Active',updated_at=v_at where id=r.id returning * into r;
      v_projection := jsonb_build_object('status',case when r.assigned_am_id is null then 'Unassigned' else 'In Progress' end);
    else
      v_status := p_payload->>'status';
      if r.status='Completed' and v_status is not null and v_status not in ('Completed','Terminated') then
        raise exception 'Completed Round cannot reopen; start a new Round' using errcode='P0001';
      end if;
      if r.status='Completed' and (p_payload ? 'ownerId' or p_payload ? 'currentCpId') then
        raise exception 'Completed Round is immutable; start a new Round' using errcode='P0001';
      end if;
      if r.status='Paused' and v_status is not null and v_status not in ('Paused','Completed','Terminated') then
        raise exception 'Use Resume to continue a Paused Round' using errcode='P0001';
      end if;
      if v_status in ('Paused','Completed','Terminated') and nullif(trim(p_payload->>'note'),'') is null then
        raise exception 'A reason is required when pausing or completing' using errcode='22023';
      end if;
      if r.id is null and (v_status in ('In Progress','Paused','Completed','Terminated') or p_payload ? 'ownerId' and nullif(p_payload->>'ownerId','') is not null) then
        insert into public.followup_rounds(brand_id,round_number,status,assigned_am_id,assigned_am_name,current_cp,started_at)
        values(p_brand_id,1,'Active',nullif(p_seed->>'ownerId',''),nullif(p_seed->>'ownerName',''),nullif(p_seed->>'currentCpId',''),v_at) returning * into r;
      end if;
      if r.id is not null then
        v_owner := case when p_payload ? 'ownerId' then nullif(p_payload->>'ownerId','') else r.assigned_am_id end;
        v_owner_name := case when p_payload ? 'ownerId' then nullif(p_payload->>'ownerName','') else r.assigned_am_name end;
        if v_owner is distinct from r.assigned_am_id then
          insert into public.followup_assignment_history(round_id,previous_am_id,previous_am_name,new_am_id,new_am_name,changed_by)
          values(r.id,r.assigned_am_id,r.assigned_am_name,v_owner,v_owner_name,coalesce(p_payload->>'changedBy','Unknown'));
        end if;
        v_cp := case when p_payload ? 'currentCpId' then nullif(p_payload->>'currentCpId','') else r.current_cp end;
        update public.followup_rounds set assigned_am_id=v_owner,assigned_am_name=v_owner_name,current_cp=v_cp,
          status=case when v_status='Paused' then 'Paused' when v_status in ('Completed','Terminated') then 'Completed' else status end,
          paused_at=case when v_status='Paused' then v_at else paused_at end,
          paused_reason=case when v_status='Paused' then p_payload->>'note' else paused_reason end,
          completed_at=case when v_status in ('Completed','Terminated') then coalesce(completed_at,v_at) else completed_at end,
          outcome=case when v_status in ('Completed','Terminated') then p_payload->>'note' else outcome end,updated_at=v_at
        where id=r.id;
      end if;
      v_projection := p_payload - 'expectedRoundId' - 'expectedVersion' - 'changedBy' - 'ownerName';
    end if;
  else
    raise exception 'Unknown follow-up action' using errcode='22023';
  end if;
  update public.followup_brand_state set version=version+1,projection=v_projection where brand_id=p_brand_id;
  return public.followup_history(p_brand_id) || jsonb_build_object('duplicate',false);
end;
$$;

-- One projector at a time. Mutations wait while there is a pending projection.
-- Failures release the claim; timeouts leave a durable outbox for retry.
create function public.followup_projection(p_brand_id text,p_action text,p_token uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s public.followup_brand_state%rowtype; v_token uuid;
begin
  select * into s from public.followup_brand_state where brand_id=p_brand_id for update;
  if s.projection is null then return null; end if;
  if p_action='claim' then
    if s.projection_token is not null and s.projection_claimed_at>now()-interval '5 minutes' then return null; end if;
    v_token := gen_random_uuid();
    update public.followup_brand_state set projection_token=v_token,projection_claimed_at=now() where brand_id=p_brand_id;
    return jsonb_build_object('token',v_token,'version',s.version,'patch',s.projection);
  elsif p_action='ack' and s.projection_token=p_token then
    update public.followup_brand_state set projection=null,projection_token=null,projection_claimed_at=null where brand_id=p_brand_id;
  elsif p_action='release' and s.projection_token=p_token then
    update public.followup_brand_state set projection_token=null,projection_claimed_at=null where brand_id=p_brand_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.followup_history(text), public.followup_mutate(text,text,jsonb,jsonb), public.followup_projection(text,text,uuid) from public, anon, authenticated;
grant execute on function public.followup_history(text), public.followup_mutate(text,text,jsonb,jsonb), public.followup_projection(text,text,uuid) to service_role;
