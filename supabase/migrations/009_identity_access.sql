-- Identity bootstrap. Legacy content remains unowned until an explicit mapping is applied.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id),
  display_name text not null default '' check(length(display_name) <= 100),
  avatar_path text, school_name text,
  created_at timestamptz not null default now()
);
create table public.user_access (
  user_id uuid primary key references auth.users(id),
  role text not null default 'learner' check(role in ('learner','author','admin')),
  status text not null default 'active' check(status in ('active','suspended')),
  can_author boolean not null default false,
  daily_quota integer not null default 50 check(daily_quota between 0 and 10000),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id), action text not null,
  resource_type text not null, resource_id text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index audit_events_resource_time on public.audit_events(resource_type,resource_id,created_at desc);
create index audit_events_actor_time on public.audit_events(actor_user_id,created_at desc);

create function app_private.create_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id,display_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'display_name',''),100)) on conflict do nothing;
  insert into public.user_access(user_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function app_private.create_account() from public,anon,authenticated;
create trigger create_math_account after insert on auth.users for each row execute function app_private.create_account();
insert into public.profiles(user_id,display_name) select id,left(coalesce(raw_user_meta_data->>'display_name',''),100) from auth.users on conflict do nothing;
insert into public.user_access(user_id) select id from auth.users on conflict do nothing;

create function app_private.session_current() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id');
$$;
create function public.auth_session_valid() returns boolean
language sql stable security definer set search_path = '' as $$ select app_private.session_current(); $$;
create function app_private.has_role(required_role text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.session_current() and exists(select 1 from public.user_access a where a.user_id=auth.uid() and a.status='active' and (required_role is null or a.role=required_role or (required_role='author' and a.role='admin' and a.can_author)));
$$;
create function app_private.assert_role(required_role text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare current_account public.user_access;
begin
  select * into current_account from public.user_access where user_id=auth.uid() for share;
  if not app_private.session_current() or current_account.user_id is null or current_account.status <> 'active' or (required_role is not null and current_account.role <> required_role and not (required_role='author' and current_account.role='admin' and current_account.can_author)) then
    raise exception 'permission_denied' using errcode='42501';
  end if;
end;
$$;
revoke all on function app_private.session_current(), app_private.has_role(text), app_private.assert_role(text) from public,anon,authenticated;
grant execute on function app_private.has_role(text) to authenticated;
revoke all on function public.auth_session_valid() from public,anon;
grant execute on function public.auth_session_valid() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_access enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.profiles,public.user_access,public.audit_events from anon,authenticated;
grant select on public.profiles,public.user_access,public.audit_events to authenticated;
grant update(display_name,avatar_path,school_name) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using ((user_id=auth.uid() and app_private.has_role()) or app_private.has_role('admin'));
create policy profile_write on public.profiles for update to authenticated using (user_id=auth.uid() and app_private.has_role()) with check(user_id=auth.uid() and app_private.has_role());
create policy access_read on public.user_access for select to authenticated using(user_id=auth.uid() or app_private.has_role('admin'));
create policy audit_read on public.audit_events for select to authenticated using(app_private.has_role('admin'));

create function public.admin_update_access(target_user uuid,new_role text,new_status text,new_quota integer,new_can_author boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare old_access public.user_access;
begin
  -- Serialize role changes before taking account row locks, protecting the last admin.
  perform pg_catalog.pg_advisory_xact_lock(987654321);
  perform app_private.assert_role('admin');
  if new_role not in ('learner','author','admin') or new_status not in ('active','suspended') or new_quota not between 0 and 10000 then raise exception 'invalid_access'; end if;
  select * into old_access from public.user_access where user_id=target_user for update;
  if not found then raise exception 'account_not_found'; end if;
  if old_access.role='admin' and old_access.status='active' and (new_role<>'admin' or new_status<>'active') and (select count(*) from public.user_access where role='admin' and status='active')<=1 then raise exception 'last_admin'; end if;
  update public.user_access set role=new_role,status=new_status,daily_quota=new_quota,can_author=(new_role='admin' and new_can_author),updated_by=auth.uid(),updated_at=now() where user_id=target_user;
  if new_status='suspended' then delete from auth.sessions where user_id=target_user; end if;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id,metadata) values(auth.uid(),'account.access.update','user',target_user::text,jsonb_build_object('before',jsonb_build_object('role',old_access.role,'status',old_access.status,'quota',old_access.daily_quota),'after',jsonb_build_object('role',new_role,'status',new_status,'quota',new_quota)));
end;
$$;
revoke all on function public.admin_update_access(uuid,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_update_access(uuid,text,text,integer,boolean) to authenticated;

alter table public.materials add column owner_id uuid references auth.users(id), add column moderated boolean not null default false;
alter table public.curricula add column owner_user_id uuid references auth.users(id);
alter table public.exploration_sessions add column owner_id uuid references auth.users(id);
alter table public.solve_sessions add column owner_id uuid references auth.users(id);
alter table public.curriculum_progress add column learner_user_id uuid references auth.users(id), add column curriculum_revision integer not null default 0;
alter table public.curriculum_progress drop constraint curriculum_progress_pkey;
alter table public.curriculum_progress add primary key(curriculum_id,learner_id,curriculum_revision);
create index materials_owner_updated on public.materials(owner_id,updated_at desc);
create index curricula_owner_updated on public.curricula(owner_user_id,updated_at desc);
create index exploration_account_updated on public.exploration_sessions(owner_id,updated_at desc);
create index solve_account_updated on public.solve_sessions(owner_id,updated_at desc);
create index progress_account_updated on public.curriculum_progress(learner_user_id,updated_at desc);

revoke all on public.materials,public.visuals,public.curricula,public.exploration_sessions,public.solve_sessions,public.curriculum_progress from anon,authenticated;
grant select,delete on public.materials,public.curricula,public.exploration_sessions,public.solve_sessions to authenticated;
grant select on public.visuals to authenticated;
grant select,insert,update on public.curriculum_progress to authenticated;
create policy material_owner_read on public.materials for select to authenticated using(owner_id=auth.uid() and app_private.has_role('author'));
create policy material_owner_delete on public.materials for delete to authenticated using(owner_id=auth.uid() and app_private.has_role('author'));
create policy visual_owner_read on public.visuals for select to authenticated using(exists(select 1 from public.materials m where m.id=material_id and m.owner_id=auth.uid() and app_private.has_role('author')));
create policy curriculum_owner_read on public.curricula for select to authenticated using(owner_user_id=auth.uid() and app_private.has_role('author'));
create policy curriculum_owner_delete on public.curricula for delete to authenticated using(owner_user_id=auth.uid() and app_private.has_role('author'));
create policy exploration_owner_read on public.exploration_sessions for select to authenticated using(owner_id=auth.uid() and app_private.has_role());
create policy exploration_owner_delete on public.exploration_sessions for delete to authenticated using(owner_id=auth.uid() and app_private.has_role());
create policy solve_owner_read on public.solve_sessions for select to authenticated using(owner_id=auth.uid() and app_private.has_role());
create policy solve_owner_delete on public.solve_sessions for delete to authenticated using(owner_id=auth.uid() and app_private.has_role());
create policy progress_owner_read on public.curriculum_progress for select to authenticated using(learner_user_id=auth.uid() and app_private.has_role());
-- Insert/update policies and revision checks are installed with publication schema in migration 010.
