-- OPERATOR ONLY. Inspect the unowned rows and back up the database first.
-- Legacy publications are retained as drafts until the owner publishes them
-- through the new validated snapshot flow. Device histories remain unmapped.
begin;
do $$
declare owner_uuid uuid; material_ids uuid[]; curriculum_ids uuid[];
begin
  select id into owner_uuid from auth.users
  where lower(email)='vokhactuyen2006@gmail.com' and email_confirmed_at is not null;
  if owner_uuid is null or not exists(select 1 from public.user_access where user_id=owner_uuid and status='active' and (role='author' or role='admin' and can_author)) then
    raise exception 'Register, verify and grant author capability to the reviewed owner first';
  end if;
  material_ids := array(select id from public.materials where owner_id is null for update);
  curriculum_ids := array(select id from public.curricula where owner_user_id is null for update);
  update public.materials set owner_id=owner_uuid,status='draft',published_revision=null,published_at=null,
    visibility=case when visibility='public' then 'public' else 'private' end,
    content_json=content_json || jsonb_build_object('ownerId',owner_uuid,'status','draft','publishedAt',null,'visibility',case when visibility='public' then 'public' else 'private' end)
    where id=any(material_ids);
  update public.curricula set owner_id=owner_uuid::text,owner_user_id=owner_uuid,status='draft',published_revision=null,published_at=null,
    content_json=content_json || jsonb_build_object('ownerId',owner_uuid,'status','draft','publishedAt',null)
    where id=any(curriculum_ids);
  insert into public.audit_events(action,resource_type,resource_id,metadata)
    values('legacy.owner.map','user',owner_uuid::text,jsonb_build_object('materialCount',cardinality(material_ids),'curriculumCount',cardinality(curriculum_ids),'operatorReviewed',true));
end;
$$;
commit;
