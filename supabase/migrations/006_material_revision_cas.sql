-- Atomic compare-and-swap persistence for Studio materials.
-- expected_revision IS NULL means insert-only; otherwise only that exact
-- stored revision can be replaced. Visual rows change in the same transaction.
create or replace function public.save_math_material_cas(
  document jsonb,
  expected_revision integer
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_material_id uuid := (document->>'id')::uuid;
  saved_id uuid;
begin
  if expected_revision is null then
    insert into public.materials(
      id, title, slug, description, content_json, status, grade, topic, type, tags,
      visibility, learning_steps, revision, published_at, created_at, updated_at
    ) values (
      v_material_id,
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
    ) on conflict (id) do nothing
    returning id into saved_id;
  else
    update public.materials set
      title = document->>'title',
      slug = document->>'slug',
      description = document->>'summary',
      content_json = document,
      status = document->>'status',
      grade = document->'metadata'->>'grade',
      topic = document->'metadata'->>'topic',
      type = document->'metadata'->>'type',
      tags = array(select jsonb_array_elements_text(document->'metadata'->'tags')),
      visibility = coalesce(document->>'visibility', 'private'),
      learning_steps = coalesce(document->'learningSteps', '[]'::jsonb),
      revision = coalesce((document->>'revision')::integer, expected_revision + 1),
      published_at = nullif(document->>'publishedAt', '')::timestamptz,
      updated_at = (document->>'updatedAt')::timestamptz
    where id = v_material_id and revision = expected_revision
    returning id into saved_id;
  end if;

  if saved_id is null then
    raise exception using
      errcode = '40001',
      message = 'material_revision_conflict';
  end if;

  delete from public.visuals where public.visuals.material_id = v_material_id;
  insert into public.visuals(id, material_id, spec_json)
  select visual.value->>'id', v_material_id, visual.value
  from jsonb_array_elements(coalesce(document->'visuals', '[]'::jsonb)) as visual(value);
end;
$$;

revoke all on function public.save_math_material_cas(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_math_material_cas(jsonb, integer) to service_role;
