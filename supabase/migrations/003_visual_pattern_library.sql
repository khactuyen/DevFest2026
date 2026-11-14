-- Built-in model templates are versioned separately from visual instances
-- embedded in a material. Existing material.content_json and visuals.spec_json
-- remain valid, so this migration is safe for already-authored lessons.
create table if not exists public.visual_patterns (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version integer not null default 1 check (version >= 1),
  title text not null,
  description text not null default '',
  dimension text not null check (dimension in ('2d', '3d')),
  engine text not null check (engine in ('jsxgraph', 'threejs')),
  topic text not null default 'Toán học',
  grade_levels text[] not null default '{}',
  tags text[] not null default '{}',
  schema_json jsonb not null,
  defaults_json jsonb not null,
  thumbnail_url text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(key, version)
);

create index if not exists visual_patterns_catalog
  on public.visual_patterns(status, dimension, topic, updated_at desc);

alter table public.visual_patterns enable row level security;

-- The web API serves the checked-in built-in catalog until an administration
-- screen is introduced. These policies make future database-backed catalog
-- reads safe without granting anonymous write access.
create policy "published visual patterns are readable"
  on public.visual_patterns for select
  using (status = 'published');

