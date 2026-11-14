create table if not exists public.materials (
 id uuid primary key, title text not null, slug text unique, description text,
 content_json jsonb not null, status text not null check(status in ('draft','published')),
 grade text, topic text, type text, tags text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.visuals (
 id text not null, material_id uuid not null references public.materials(id) on delete cascade,
 spec_json jsonb not null, initial_state_json jsonb, thumbnail_url text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(material_id,id)
);
create index if not exists materials_filter on public.materials(status,topic,grade,type);
alter table public.materials enable row level security;
alter table public.visuals enable row level security;
-- Only the server's service-role key writes; reads pass through the API.
create or replace function public.save_math_material(document jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
 insert into materials(id,title,slug,description,content_json,status,grade,topic,type,tags,created_at,updated_at)
 values((document->>'id')::uuid,document->>'title',document->>'slug',document->>'summary',document,document->>'status',document->'metadata'->>'grade',document->'metadata'->>'topic',document->'metadata'->>'type',array(select jsonb_array_elements_text(document->'metadata'->'tags')),(document->>'createdAt')::timestamptz,(document->>'updatedAt')::timestamptz)
 on conflict(id) do update set title=excluded.title,slug=excluded.slug,description=excluded.description,content_json=excluded.content_json,status=excluded.status,grade=excluded.grade,topic=excluded.topic,type=excluded.type,tags=excluded.tags,updated_at=excluded.updated_at;
 delete from visuals where material_id=(document->>'id')::uuid;
 insert into visuals(id,material_id,spec_json) select v->>'id',(document->>'id')::uuid,v from jsonb_array_elements(document->'visuals') v;
end; $$;
revoke all on function public.save_math_material(jsonb) from public,anon,authenticated;
grant execute on function public.save_math_material(jsonb) to service_role;
