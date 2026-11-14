-- Manual exams keep their answer keys in the author edition.
create or replace function public.grade_published_material(identifier text,block_id text,submitted_answer text,share_token text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare assessment jsonb; correct boolean := false;
begin
  if length(submitted_answer)>400 then return null; end if;
  select b->'assessment' into assessment
  from public.materials m
  join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision,
    jsonb_array_elements(r.content_json->'blocks') b
  where (m.id::text=$1 or m.slug=$1) and app_private.can_read_material(m.id,$4)
    and not (r.content_json ? 'exam') and b->>'id'=$2 and b->>'type'='exercise' limit 1;
  if assessment is null then return null; end if;
  if assessment->>'type'='multiple' then
    correct := $3 ~ '^\d+$' and length($3)<10 and case when $3 ~ '^\d+$' and length($3)<10 then $3::integer=(assessment->>'correctIndex')::integer else false end;
  elsif assessment->>'type'='short' then
    correct := length(trim(coalesce(assessment->>'answer','')))>0 and lower(trim($3))=lower(trim(assessment->>'answer'));
  end if;
  return jsonb_build_object('correct',coalesce(correct,false),'explanation',case when correct then coalesce(assessment->>'explanation','') else '' end);
end;
$$;
