create table if not exists public.solve_sessions (
  id uuid primary key, owner_key text not null,
  revision integer not null check (revision >= 1), content_json jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists solve_sessions_owner_updated on public.solve_sessions(owner_key, updated_at desc);
alter table public.solve_sessions enable row level security;
-- Access follows the existing server-side AUTHOR_TOKEN gate. owner_key is a
-- device namespace, not an authenticated user identity or a tenant boundary.
create or replace function public.save_solve_session(document jsonb, expected_revision integer)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  sid uuid := (document->>'id')::uuid;
  owner text := document->>'ownerKey';
  next_revision integer := expected_revision + 1;
  affected integer;
begin
  if expected_revision = 0 then
    document := jsonb_set(document, '{revision}', '1'::jsonb);
    insert into solve_sessions(id, owner_key, revision, content_json, created_at, updated_at)
    values(sid, owner, 1, document, (document->>'createdAt')::timestamptz, (document->>'updatedAt')::timestamptz) on conflict(id) do nothing;
  else
    update solve_sessions set revision=next_revision,
      content_json=jsonb_set(jsonb_set(document, '{revision}', to_jsonb(next_revision)), '{createdAt}', content_json->'createdAt'),
      updated_at=now()
    where id=sid and owner_key=owner and revision=expected_revision;
  end if;
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'revision_conflict' using errcode='40001'; end if;
  return next_revision;
end;
$$;
revoke all on function public.save_solve_session(jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_solve_session(jsonb,integer) to service_role;
