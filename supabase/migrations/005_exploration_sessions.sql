create table if not exists public.exploration_sessions (
  id uuid primary key,
  owner_key text not null,
  revision integer not null default 1 check (revision >= 1),
  content_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exploration_sessions_owner_updated
  on public.exploration_sessions(owner_key, updated_at desc);

alter table public.exploration_sessions enable row level security;

-- Only the server-side service role can save sessions through this RPC.
create or replace function public.save_exploration_session(document jsonb, expected_revision integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_id uuid := (document->>'id')::uuid;
  session_owner text := document->>'ownerKey';
  next_revision integer;
  affected integer;
begin
  if expected_revision = 0 then
    insert into exploration_sessions(id, owner_key, revision, content_json, created_at, updated_at)
    values(session_id, session_owner, 1, jsonb_set(document, '{revision}', '1'::jsonb), (document->>'createdAt')::timestamptz, (document->>'updatedAt')::timestamptz)
    on conflict(id) do nothing;
    get diagnostics affected = row_count;
    if affected = 0 then
      raise exception 'revision_conflict' using errcode = '40001';
    end if;
    return 1;
  end if;

  next_revision := expected_revision + 1;
  update exploration_sessions
  set revision = next_revision,
      content_json = jsonb_set(document, '{revision}', to_jsonb(next_revision)),
      updated_at = (document->>'updatedAt')::timestamptz
  where id = session_id and owner_key = session_owner and revision = expected_revision;
  get diagnostics affected = row_count;
  if affected = 0 then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;
  return next_revision;
end;
$$;

revoke all on function public.save_exploration_session(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_exploration_session(jsonb, integer) to service_role;
