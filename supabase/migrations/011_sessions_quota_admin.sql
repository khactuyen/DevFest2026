create or replace function public.save_exploration_session(document jsonb,expected_revision integer) returns integer
language plpgsql security definer set search_path='' as $$
declare sid uuid := (document->>'id')::uuid; doc jsonb; previous public.exploration_sessions; next_revision integer := expected_revision+1; owner_key text := 'user_'||replace(auth.uid()::text,'-','');
begin
  perform app_private.assert_role();
  if expected_revision<0 or length(document::text)>1500000 then raise exception 'invalid_session'; end if;
  if expected_revision>0 then
    select * into previous from public.exploration_sessions where id=sid and owner_id=auth.uid() for update;
    if not found or previous.revision<>expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
  end if;
  doc := document || jsonb_build_object('ownerKey',owner_key,'revision',next_revision,'createdAt',app_private.iso_time(coalesce(previous.created_at,now())),'updatedAt',app_private.iso_time(now()));
  if expected_revision=0 then insert into public.exploration_sessions(id,owner_id,owner_key,revision,content_json) values(sid,auth.uid(),owner_key,1,doc);
  else update public.exploration_sessions set revision=next_revision,content_json=doc,updated_at=now() where id=sid and owner_id=auth.uid(); end if;
  return next_revision;
exception when unique_violation then raise exception 'revision_conflict' using errcode='40001';
end;
$$;
create or replace function public.save_solve_session(document jsonb,expected_revision integer) returns integer
language plpgsql security definer set search_path='' as $$
declare sid uuid := (document->>'id')::uuid; doc jsonb; previous public.solve_sessions; next_revision integer := expected_revision+1; owner_key text := 'user_'||replace(auth.uid()::text,'-','');
begin
  perform app_private.assert_role();
  if expected_revision<0 or length(document::text)>2000000 then raise exception 'invalid_session'; end if;
  if expected_revision>0 then
    select * into previous from public.solve_sessions where id=sid and owner_id=auth.uid() for update;
    if not found or previous.revision<>expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
  end if;
  doc := document || jsonb_build_object('ownerKey',owner_key,'revision',next_revision,'createdAt',app_private.iso_time(coalesce(previous.created_at,now())),'updatedAt',app_private.iso_time(now()));
  if expected_revision=0 then insert into public.solve_sessions(id,owner_id,owner_key,revision,content_json) values(sid,auth.uid(),owner_key,1,doc);
  else update public.solve_sessions set revision=next_revision,content_json=doc,updated_at=now() where id=sid and owner_id=auth.uid(); end if;
  return next_revision;
exception when unique_violation then raise exception 'revision_conflict' using errcode='40001';
end;
$$;
revoke all on function public.save_exploration_session(jsonb,integer),public.save_solve_session(jsonb,integer) from public,anon,service_role;
grant execute on function public.save_exploration_session(jsonb,integer),public.save_solve_session(jsonb,integer) to authenticated;

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), operation text not null,
  request_key text not null check(length(request_key) between 1 and 128), day date not null,
  state text not null check(state in ('held','settled','released')), expires_at timestamptz not null,
  created_at timestamptz not null default now(), settled_at timestamptz,
  unique(user_id,request_key)
);
create index ai_runs_user_day_state on public.ai_runs(user_id,day,state);
alter table public.ai_runs enable row level security;
revoke all on public.ai_runs from anon,authenticated;
grant select on public.ai_runs to authenticated;
create policy own_ai_usage on public.ai_runs for select to authenticated using((user_id=auth.uid() and app_private.has_role()) or app_private.has_role('admin'));
create function public.reserve_ai_run(operation text,request_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare run_id uuid; quota integer; used integer; inflight integer; today date := (now() at time zone 'UTC')::date;
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(auth.uid()::text,127));
  perform app_private.assert_role();
  if length($1)>100 or length($2) not between 1 and 128 then raise exception 'invalid_request'; end if;
  if exists(select 1 from public.ai_runs r where r.user_id=auth.uid() and r.request_key=$2) then raise exception 'duplicate_request'; end if;
  select daily_quota into quota from public.user_access where user_id=auth.uid();
  update public.ai_runs set state='settled',settled_at=now() where user_id=auth.uid() and state='held' and expires_at<=now();
  select count(*) filter(where state<>'released'), count(*) filter(where state='held') into used,inflight from public.ai_runs where user_id=auth.uid() and day=today;
  if used>=quota or inflight>=3 then raise exception 'quota_exceeded'; end if;
  insert into public.ai_runs(user_id,operation,request_key,day,state,expires_at) values(auth.uid(),$1,$2,today,'held',now()+interval '10 minutes') returning id into run_id;
  return run_id;
end;
$$;
-- Only the trusted backend settles work; a user cannot refund their own quota via Data API.
create function public.settle_ai_run(run_id uuid,actor_id uuid,succeeded boolean) returns void
language sql security definer set search_path='' as $$
  update public.ai_runs set state=case when $3 then 'settled' else 'released' end,settled_at=now() where id=$1 and user_id=$2 and state='held';
$$;
revoke all on function public.reserve_ai_run(text,text),public.settle_ai_run(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_ai_run(text,text) to authenticated;
grant execute on function public.settle_ai_run(uuid,uuid,boolean) to service_role;

create function public.admin_list_accounts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not app_private.has_role('admin') then raise exception 'permission_denied' using errcode='42501'; end if;
  return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('id',a.user_id,'email',u.email,'displayName',p.display_name,'role',a.role,'status',a.status,'quota',a.daily_quota,'canAuthor',a.can_author) order by u.created_at) from public.user_access a join auth.users u on u.id=a.user_id join public.profiles p on p.user_id=a.user_id),'[]'::jsonb), 'audit',coalesce((select jsonb_agg(jsonb_build_object('actorId',actor_user_id,'action',action,'targetId',resource_id,'at',created_at)) from (select * from public.audit_events order by created_at desc limit 100) events),'[]'::jsonb));
end;
$$;
create function public.admin_material_summaries() returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not app_private.has_role('admin') then raise exception 'permission_denied' using errcode='42501'; end if;
  return query select jsonb_build_object('id',m.id,'title',r.reader_json->>'title','withdrawn',m.moderated) from public.materials m join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision;
end;
$$;
create function public.admin_moderate_material(material_id uuid,withdrawn boolean,reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role('admin');
  if coalesce(length(trim($3)),0) not between 3 and 500 then raise exception 'reason_required'; end if;
  update public.materials set moderated=$2 where id=$1 and published_revision is not null;
  if not found then raise exception 'material_not_found'; end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,metadata) values(auth.uid(),'material.moderate','material',$1::text,jsonb_build_object('withdrawn',$2,'reason',$3));
end;
$$;
create function app_private.audit_resource_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),TG_TABLE_NAME||'.delete',TG_TABLE_NAME,old.id::text);
  return old;
end;
$$;
create trigger audit_material_delete before delete on public.materials for each row execute function app_private.audit_resource_delete();
create trigger audit_curriculum_delete before delete on public.curricula for each row execute function app_private.audit_resource_delete();
revoke all on function app_private.audit_resource_delete() from public,anon,authenticated;
revoke all on function public.admin_list_accounts(),public.admin_material_summaries(),public.admin_moderate_material(uuid,boolean,text) from public,anon;
grant execute on function public.admin_list_accounts(),public.admin_material_summaries(),public.admin_moderate_material(uuid,boolean,text) to authenticated;
