-- Core authoring fields. This migration is backward compatible with documents
-- created before Studio gained learning-flow, visibility, and revision support.
alter table public.materials
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'link', 'school', 'public')),
  add column if not exists learning_steps jsonb not null default '[]'::jsonb,
  add column if not exists revision integer not null default 1 check (revision >= 1),
  add column if not exists published_at timestamptz;

create index if not exists materials_visibility_status
  on public.materials(visibility, status, updated_at desc);

create or replace function public.save_math_material(document jsonb) returns void
language plpgsql security invoker set search_path=public as $$
begin
 insert into materials(
   id,title,slug,description,content_json,status,grade,topic,type,tags,
   visibility,learning_steps,revision,published_at,created_at,updated_at
 ) values(
   (document->>'id')::uuid,
   document->>'title',
   document->>'slug',
   document->>'summary',
   document,
   document->>'status',
   document->'metadata'->>'grade',
   document->'metadata'->>'topic',
   document->'metadata'->>'type',
   array(select jsonb_array_elements_text(document->'metadata'->'tags')),
   coalesce(document->>'visibility', 'private'),
   coalesce(document->'learningSteps', '[]'::jsonb),
   coalesce((document->>'revision')::integer, 1),
   nullif(document->>'publishedAt', '')::timestamptz,
   (document->>'createdAt')::timestamptz,
   (document->>'updatedAt')::timestamptz
 )
 on conflict(id) do update set
   title=excluded.title,
   slug=excluded.slug,
   description=excluded.description,
   content_json=excluded.content_json,
   status=excluded.status,
   grade=excluded.grade,
   topic=excluded.topic,
   type=excluded.type,
   tags=excluded.tags,
   visibility=excluded.visibility,
   learning_steps=excluded.learning_steps,
   revision=excluded.revision,
   published_at=excluded.published_at,
   updated_at=excluded.updated_at;

 delete from visuals where material_id=(document->>'id')::uuid;
 insert into visuals(id,material_id,spec_json)
 select v->>'id',(document->>'id')::uuid,v
 from jsonb_array_elements(document->'visuals') v;
end; $$;
