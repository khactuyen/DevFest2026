-- Curriculum and learner-progress persistence. Materials remain owned by
-- Studio; a curriculum lesson stores only the material UUID it points to.
create table if not exists public.curricula (
  id uuid primary key,
  owner_id text not null,
  title text not null,
  description text not null default '',
  subject text not null default 'Toán học',
  grade_band text not null default 'THPT',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  content_json jsonb not null,
  revision integer not null default 1 check (revision >= 1),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curricula_status_updated
  on public.curricula(status, updated_at desc);

create table if not exists public.curriculum_progress (
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  learner_id text not null,
  content_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(curriculum_id, learner_id)
);

create index if not exists curriculum_progress_learner_updated
  on public.curriculum_progress(learner_id, updated_at desc);

alter table public.curricula enable row level security;
alter table public.curriculum_progress enable row level security;

-- The current API uses the Supabase service role server-side. Public tables
-- therefore remain closed until application authentication/RLS is added.
