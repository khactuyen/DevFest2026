create function app_private.iso_time(value timestamptz) returns text language sql immutable strict set search_path='' as $$ select to_char(value at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'); $$;
revoke all on function app_private.iso_time(timestamptz) from public,anon,authenticated;
alter table public.materials add column published_revision integer;
alter table public.curricula add column published_revision integer;
create table public.material_revisions (
  material_id uuid not null references public.materials(id) on delete cascade,
  revision_no integer not null check(revision_no>=1),
  content_json jsonb not null, reader_json jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  primary key(material_id,revision_no)
);
create table public.curriculum_revisions (
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  revision_no integer not null check(revision_no>=1), content_json jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  primary key(curriculum_id,revision_no)
);
alter table public.materials add foreign key(id,published_revision) references public.material_revisions(material_id,revision_no) deferrable initially deferred;
alter table public.curricula add foreign key(id,published_revision) references public.curriculum_revisions(curriculum_id,revision_no) deferrable initially deferred;
create table public.curriculum_revision_materials (
  curriculum_id uuid not null, curriculum_revision integer not null,
  lesson_id text not null, material_id uuid not null, material_revision integer not null,
  primary key(curriculum_id,curriculum_revision,lesson_id),
  foreign key(curriculum_id,curriculum_revision) references public.curriculum_revisions(curriculum_id,revision_no) on delete cascade,
  foreign key(material_id,material_revision) references public.material_revisions(material_id,revision_no)
);
create table public.material_share_links (
  id uuid primary key default gen_random_uuid(), material_id uuid not null references public.materials(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), created_by uuid not null references auth.users(id),
  expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
alter table public.material_revisions enable row level security;
alter table public.curriculum_revisions enable row level security;
alter table public.curriculum_revision_materials enable row level security;
alter table public.material_share_links enable row level security;
revoke all on public.material_revisions,public.curriculum_revisions,public.curriculum_revision_materials,public.material_share_links from anon,authenticated;
grant select on public.material_revisions,public.curriculum_revisions to authenticated;
create policy material_revision_owner on public.material_revisions for select to authenticated using(exists(select 1 from public.materials m where m.id=material_id and m.owner_id=auth.uid() and app_private.has_role('author')));
create policy curriculum_revision_owner on public.curriculum_revisions for select to authenticated using(exists(select 1 from public.curricula c where c.id=curriculum_id and c.owner_user_id=auth.uid() and app_private.has_role('author')));

create function app_private.reader_document(document jsonb) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_set(document-'sourcePages'-'reviewNotes'-'sourceReviewedAt','{blocks}',coalesce((select jsonb_agg(case when block ? 'assessment' then jsonb_set(block,'{assessment}',(block->'assessment')-'answer'-'correctIndex'-'explanation') else block end order by ordinal) from jsonb_array_elements(document->'blocks') with ordinality as b(block,ordinal)), '[]'::jsonb));
$$;
create function app_private.can_read_material(material_id uuid,share_token text default '') returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.materials m where m.id=$1 and m.owner_id is not null and m.status='published' and m.published_revision is not null and not m.moderated and
    (m.visibility='public' or (m.owner_id=auth.uid() and app_private.has_role('author')) or (m.visibility='link' and length($2) between 40 and 100 and exists(select 1 from public.material_share_links l where l.material_id=m.id and l.token_hash=encode(sha256(convert_to($2,'UTF8')),'hex') and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())))));
$$;
revoke all on function app_private.reader_document(jsonb),app_private.can_read_material(uuid,text) from public,anon,authenticated;

create function public.list_published_materials() returns setof jsonb
language sql stable security definer set search_path='' as $$
  select r.reader_json || jsonb_build_object('visibility',m.visibility) from public.materials m join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision
  where m.owner_id is not null and m.status='published' and m.visibility='public' and not m.moderated order by m.updated_at desc;
$$;
create function public.read_published_material(identifier text,share_token text default '') returns jsonb
language sql stable security definer set search_path='' as $$
  select r.reader_json || jsonb_build_object('visibility',m.visibility) from public.materials m join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision
  where (m.id::text=$1 or m.slug=$1) and app_private.can_read_material(m.id,$2) limit 1;
$$;

create function public.save_owned_material(document jsonb,expected_revision integer,publication_action text default 'save') returns void
language plpgsql security definer set search_path='' as $$
declare m public.materials; mid uuid := (document->>'id')::uuid; doc jsonb; next_revision integer := coalesce(expected_revision,0)+1; next_status text; publication integer;
begin
  perform app_private.assert_role('author');
  if publication_action not in ('save','publish','unpublish') or length(document::text)>1200000 or coalesce(document->>'visibility','private') not in ('private','link','public') or coalesce(length(trim(document->>'title')),0) not between 1 and 200 or jsonb_typeof(document->'blocks') is distinct from 'array' or jsonb_array_length(document->'blocks')>100 or jsonb_typeof(document->'visuals') is distinct from 'array' or jsonb_array_length(document->'visuals')>30 then raise exception 'invalid_document'; end if;
  if (document->>'revision')::integer<>next_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
  if expected_revision is null then
    if publication_action<>'save' then raise exception 'create_draft_first'; end if;
    next_status := 'draft'; publication := null;
  else
    select * into m from public.materials where id=mid and owner_id=auth.uid() for update;
    if not found or m.revision<>expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
    next_status := case publication_action when 'publish' then 'published' when 'unpublish' then 'draft' else m.status end;
    publication := case publication_action when 'publish' then next_revision when 'unpublish' then null else m.published_revision end;
  end if;
  if publication_action='publish' and jsonb_array_length(document->'blocks')=0 then raise exception 'empty_publication'; end if;
  doc := document || jsonb_build_object('ownerId',auth.uid(),'revision',next_revision,'status',next_status,'createdAt',app_private.iso_time(coalesce(m.created_at,now())),'updatedAt',app_private.iso_time(now()),'publishedAt',app_private.iso_time(case when next_status='published' then coalesce(case when publication_action='publish' then now() else m.published_at end,now()) else null end));
  if expected_revision is null then
    insert into public.materials(id,owner_id,title,slug,description,content_json,status,grade,topic,type,tags,visibility,learning_steps,revision,published_at)
    values(mid,auth.uid(),doc->>'title',doc->>'slug',doc->>'summary',doc,next_status,doc->'metadata'->>'grade',doc->'metadata'->>'topic',doc->'metadata'->>'type',array(select jsonb_array_elements_text(coalesce(doc->'metadata'->'tags','[]'::jsonb))),doc->>'visibility',coalesce(doc->'learningSteps','[]'::jsonb),next_revision,(doc->>'publishedAt')::timestamptz);
  else
    update public.materials set title=doc->>'title',slug=doc->>'slug',description=doc->>'summary',content_json=doc,status=next_status,grade=doc->'metadata'->>'grade',topic=doc->'metadata'->>'topic',type=doc->'metadata'->>'type',tags=array(select jsonb_array_elements_text(coalesce(doc->'metadata'->'tags','[]'::jsonb))),visibility=doc->>'visibility',learning_steps=coalesce(doc->'learningSteps','[]'::jsonb),revision=next_revision,published_at=(doc->>'publishedAt')::timestamptz,updated_at=now() where id=mid;
  end if;
  delete from public.visuals where material_id=mid;
  insert into public.visuals(id,material_id,spec_json) select v->>'id',mid,v from jsonb_array_elements(doc->'visuals') v;
  if publication_action='publish' then
    insert into public.material_revisions(material_id,revision_no,content_json,reader_json,created_by) values(mid,next_revision,doc,app_private.reader_document(doc),auth.uid());
  end if;
  update public.materials set published_revision=publication where id=mid;
  if publication_action<>'save' then insert into public.audit_events(actor_user_id,action,resource_type,resource_id,metadata) values(auth.uid(),'material.'||publication_action,'material',mid::text,jsonb_build_object('revision',next_revision)); end if;
end;
$$;

create function public.create_material_link(material_id uuid,link_id uuid,token_hash text,expires_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role('author');
  perform 1 from public.materials where id=$1 and owner_id=auth.uid() and status='published' and visibility='link' and published_revision is not null for update;
  if not found or ($4 is not null and $4<=now()) then raise exception 'invalid_link_target'; end if;
  insert into public.material_share_links(id,material_id,token_hash,expires_at,created_by) values($2,$1,$3,$4,auth.uid());
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),'material.share.create','material',$1::text);
end;
$$;
create function public.revoke_material_links(material_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role('author');
  perform 1 from public.materials where id=$1 and owner_id=auth.uid() for update;
  if not found then raise exception 'permission_denied' using errcode='42501'; end if;
  update public.material_share_links l set revoked_at=now() where l.material_id=$1 and l.revoked_at is null;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),'material.share.revoke','material',$1::text);
end;
$$;
create function public.grade_published_material(identifier text,block_id text,submitted_answer text,share_token text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare assessment jsonb; correct boolean := false;
begin
  if length(submitted_answer)>400 then return null; end if;
  select b->'assessment' into assessment from public.materials m join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision, jsonb_array_elements(r.content_json->'blocks') b
  where (m.id::text=$1 or m.slug=$1) and app_private.can_read_material(m.id,$4) and b->>'id'=$2 and b->>'type'='exercise' limit 1;
  if assessment is null then return null; end if;
  if assessment->>'type'='multiple' then correct := $3 ~ '^\d+$' and length($3)<10 and case when $3 ~ '^\d+$' and length($3)<10 then $3::integer=(assessment->>'correctIndex')::integer else false end;
  elsif assessment->>'type'='short' then correct := length(trim(coalesce(assessment->>'answer','')))>0 and lower(trim($3))=lower(trim(assessment->>'answer')); end if;
  return jsonb_build_object('correct',coalesce(correct,false),'explanation',case when correct then coalesce(assessment->>'explanation','') else '' end);
end;
$$;

create function public.list_published_curricula() returns setof jsonb
language sql stable security definer set search_path='' as $$
  select r.content_json from public.curricula c join public.curriculum_revisions r on r.curriculum_id=c.id and r.revision_no=c.published_revision where c.owner_user_id is not null and c.status='published' order by c.updated_at desc;
$$;
create function public.save_owned_curriculum(document jsonb,expected_revision integer,publication_action text default 'save') returns void
language plpgsql security definer set search_path='' as $$
declare c public.curricula; cid uuid := (document->>'id')::uuid; doc jsonb; next_status text; publication integer; lesson jsonb; mid uuid; mr integer; next_revision integer := expected_revision+1;
begin
  perform app_private.assert_role('author');
  if expected_revision<0 or publication_action not in ('save','publish') or length(document::text)>1500000 or coalesce(length(trim(document->>'title')),0) not between 1 and 200 or jsonb_typeof(document->'courses') is distinct from 'array' or (document->>'revision')::integer<>next_revision then raise exception 'invalid_curriculum'; end if;
  if expected_revision=0 then
    if publication_action<>'save' then raise exception 'create_draft_first'; end if;
    next_status := 'draft';
  else
    select * into c from public.curricula where id=cid and owner_user_id=auth.uid() for update;
    if not found or c.revision<>expected_revision then raise exception 'revision_conflict' using errcode='40001'; end if;
    next_status := case when publication_action='publish' then 'published' when document->>'status'='archived' then 'archived' else c.status end;
    publication := c.published_revision;
  end if;
  doc := document || jsonb_build_object('ownerId',auth.uid(),'status',next_status,'revision',next_revision,'createdAt',app_private.iso_time(coalesce(c.created_at,now())),'updatedAt',app_private.iso_time(now()),'publishedAt',app_private.iso_time(case when publication_action='publish' then now() else c.published_at end));
  if expected_revision=0 then
    insert into public.curricula(id,owner_id,owner_user_id,title,description,subject,grade_band,status,content_json,revision,created_at,updated_at,published_at)
    values(cid,auth.uid()::text,auth.uid(),doc->>'title',coalesce(doc->>'description',''),doc->>'subject',doc->>'gradeBand',next_status,doc,next_revision,now(),now(),(doc->>'publishedAt')::timestamptz);
  else update public.curricula set title=doc->>'title',description=coalesce(doc->>'description',''),subject=doc->>'subject',grade_band=doc->>'gradeBand',status=next_status,content_json=doc,revision=next_revision,updated_at=now(),published_at=(doc->>'publishedAt')::timestamptz where id=cid; end if;
  if publication_action='publish' then
    if not exists(select 1 from jsonb_array_elements(doc->'courses') course,jsonb_array_elements(course->'units') unit,jsonb_array_elements(unit->'lessons') l) then raise exception 'empty_curriculum'; end if;
    insert into public.curriculum_revisions(curriculum_id,revision_no,content_json,created_by) values(cid,next_revision,doc,auth.uid());
    for lesson in select l from jsonb_array_elements(doc->'courses') course,jsonb_array_elements(course->'units') unit,jsonb_array_elements(unit->'lessons') l loop
      mid := (lesson->>'materialId')::uuid;
      select published_revision into mr from public.materials where id=mid and owner_id is not null and status='published' and visibility='public' and not moderated for share;
      if not found or mr is null then raise exception 'lesson_material_not_public'; end if;
      insert into public.curriculum_revision_materials values(cid,next_revision,lesson->>'id',mid,mr);
    end loop;
    publication := next_revision;
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),'curriculum.publish','curriculum',cid::text);
  end if;
  update public.curricula set published_revision=publication where id=cid;
end;
$$;

create function app_private.progress_allowed(curriculum_id uuid,curriculum_revision integer) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.has_role() and exists(select 1 from public.curricula c where c.id=$1 and c.status='published' and c.published_revision=$2);
$$;
revoke all on function app_private.progress_allowed(uuid,integer) from public,anon;
grant execute on function app_private.progress_allowed(uuid,integer) to authenticated;
create policy progress_owner_insert on public.curriculum_progress for insert to authenticated with check(learner_user_id=auth.uid() and learner_id=auth.uid()::text and app_private.progress_allowed(curriculum_id,curriculum_revision));
create policy progress_owner_update on public.curriculum_progress for update to authenticated using(learner_user_id=auth.uid() and app_private.has_role()) with check(learner_user_id=auth.uid() and learner_id=auth.uid()::text and app_private.progress_allowed(curriculum_id,curriculum_revision));
create function app_private.validate_progress() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role();
  if new.learner_user_id is distinct from auth.uid() or new.learner_id is distinct from auth.uid()::text or new.content_json->>'learnerId' is distinct from auth.uid()::text or new.content_json->>'curriculumId' is distinct from new.curriculum_id::text or (new.content_json->>'curriculumRevision')::integer is distinct from new.curriculum_revision or jsonb_typeof(new.content_json->'lessons') is distinct from 'array' or length(new.content_json::text)>300000 then raise exception 'invalid_progress'; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_progress() from public,anon,authenticated;
create trigger validate_progress before insert or update on public.curriculum_progress for each row execute function app_private.validate_progress();

create function app_private.asset_public_read(object_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.materials m join public.material_revisions r on r.material_id=m.id and r.revision_no=m.published_revision,jsonb_array_elements(r.reader_json->'blocks') b
  where m.owner_id is not null and m.status='published' and m.visibility='public' and not m.moderated and b->>'authorKind'='image' and b->>'content'='/api/material-assets/'||$1);
$$;
revoke all on function app_private.asset_public_read(text) from public;
grant usage on schema app_private to anon;
grant execute on function app_private.asset_public_read(text) to anon,authenticated;
create policy material_asset_upload on storage.objects for insert to authenticated with check(bucket_id='material-assets' and exists(select 1 from public.materials m where m.id::text=split_part(name,'/',1) and m.owner_id=auth.uid() and app_private.has_role('author')));
create policy material_asset_read on storage.objects for select to anon,authenticated using(bucket_id='material-assets' and (app_private.asset_public_read(name) or exists(select 1 from public.materials m where m.id::text=split_part(name,'/',1) and m.owner_id=auth.uid() and app_private.has_role('author'))));

revoke all on function public.list_published_materials(),public.read_published_material(text,text),public.grade_published_material(text,text,text,text),public.list_published_curricula() from public;
grant execute on function public.list_published_materials(),public.read_published_material(text,text),public.grade_published_material(text,text,text,text),public.list_published_curricula() to anon,authenticated;
revoke all on function public.save_owned_material(jsonb,integer,text),public.save_owned_curriculum(jsonb,integer,text),public.create_material_link(uuid,uuid,text,timestamptz),public.revoke_material_links(uuid) from public,anon;
grant execute on function public.save_owned_material(jsonb,integer,text),public.save_owned_curriculum(jsonb,integer,text),public.create_material_link(uuid,uuid,text,timestamptz),public.revoke_material_links(uuid) to authenticated;
