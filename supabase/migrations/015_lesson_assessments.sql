create table public.lesson_assessments (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null,
  created_at timestamptz not null,
  payload jsonb not null
);
create index lesson_assessments_owner_lesson on public.lesson_assessments (owner_id, lesson_id, created_at desc);

create table public.lesson_assessment_attempts (
  id uuid primary key,
  assessment_id uuid not null references public.lesson_assessments(id) on delete cascade,
  position integer not null,
  code text not null,
  revision integer not null default 1,
  payload jsonb not null,
  unique (assessment_id, position),
  unique (assessment_id, code)
);

alter table public.lesson_assessments enable row level security;
alter table public.lesson_assessment_attempts enable row level security;
revoke all on public.lesson_assessments, public.lesson_assessment_attempts from anon, authenticated;
grant select, insert, update on public.lesson_assessments, public.lesson_assessment_attempts to service_role;

create function public.create_lesson_assessment(assessment jsonb, attempts jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.lesson_assessments (id, owner_id, lesson_id, created_at, payload)
  values ((assessment->>'id')::uuid, (assessment->>'ownerId')::uuid, (assessment->>'lessonId')::uuid,
    (assessment->>'createdAt')::timestamptz, assessment);
  insert into public.lesson_assessment_attempts (id, assessment_id, position, code, payload)
  select (item->>'key')::uuid, (assessment->>'id')::uuid, ordinal::integer, item->>'code', item
    from jsonb_array_elements(attempts) with ordinality as roster(item, ordinal);
end;
$$;
revoke all on function public.create_lesson_assessment(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_lesson_assessment(jsonb, jsonb) to service_role;

create function public.reserve_lesson_assessment_grade(actor uuid, request_key text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  quota integer;
  run uuid;
  today date := (now() at time zone 'UTC')::date;
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtextextended(actor::text,127));
  select daily_quota into quota from public.user_access where user_id = actor and status = 'active';
  if quota is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if (select count(*) from public.ai_runs where user_id = actor and day = today and state <> 'released') >= quota then
    raise exception 'quota_exceeded';
  end if;
  insert into public.ai_runs(user_id,operation,request_key,day,state,expires_at)
    values(actor,'/api/lesson-assessments/grade',$2,today,'held',now()+interval '10 minutes') returning id into run;
  return run;
end;
$$;
revoke all on function public.reserve_lesson_assessment_grade(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_lesson_assessment_grade(uuid,text) to service_role;
