-- Studio is available to every active signed-in account. Ownership still scopes all material writes.
alter policy material_owner_read on public.materials to authenticated using(owner_id=auth.uid() and app_private.has_role());
alter policy material_owner_delete on public.materials to authenticated using(owner_id=auth.uid() and app_private.has_role());
alter policy visual_owner_read on public.visuals to authenticated using(exists(select 1 from public.materials m where m.id=material_id and m.owner_id=auth.uid() and app_private.has_role()));
alter policy material_revision_owner on public.material_revisions to authenticated using(exists(select 1 from public.materials m where m.id=material_id and m.owner_id=auth.uid() and app_private.has_role()));
alter policy material_asset_upload on storage.objects to authenticated with check(bucket_id='material-assets' and exists(select 1 from public.materials m where m.id::text=split_part(name,'/',1) and m.owner_id=auth.uid() and app_private.has_role()));
alter policy material_asset_read on storage.objects to anon,authenticated using(bucket_id='material-assets' and (app_private.asset_public_read(name) or exists(select 1 from public.materials m where m.id::text=split_part(name,'/',1) and m.owner_id=auth.uid() and app_private.has_role())));

create or replace function app_private.can_read_material(material_id uuid,share_token text default '') returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.materials m where m.id=$1 and m.owner_id is not null and m.status='published' and m.published_revision is not null and not m.moderated and
    (m.visibility='public' or (m.owner_id=auth.uid() and app_private.has_role()) or (m.visibility='link' and length($2) between 40 and 100 and exists(select 1 from public.material_share_links l where l.material_id=m.id and l.token_hash=encode(sha256(convert_to($2,'UTF8')),'hex') and l.revoked_at is null and (l.expires_at is null or l.expires_at>now())))));
$$;

create or replace function public.save_owned_material(document jsonb,expected_revision integer,publication_action text default 'save') returns void
language plpgsql security definer set search_path='' as $$
declare m public.materials; mid uuid := (document->>'id')::uuid; doc jsonb; next_revision integer := coalesce(expected_revision,0)+1; next_status text; publication integer;
begin
  perform app_private.assert_role();
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

create or replace function public.create_material_link(material_id uuid,link_id uuid,token_hash text,expires_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role();
  perform 1 from public.materials where id=$1 and owner_id=auth.uid() and status='published' and visibility='link' and published_revision is not null for update;
  if not found or ($4 is not null and $4<=now()) then raise exception 'invalid_link_target'; end if;
  insert into public.material_share_links(id,material_id,token_hash,expires_at,created_by) values($2,$1,$3,$4,auth.uid());
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),'material.share.create','material',$1::text);
end;
$$;

create or replace function public.revoke_material_links(material_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform app_private.assert_role();
  perform 1 from public.materials where id=$1 and owner_id=auth.uid() for update;
  if not found then raise exception 'permission_denied' using errcode='42501'; end if;
  update public.material_share_links l set revoked_at=now() where l.material_id=$1 and l.revoked_at is null;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id) values(auth.uid(),'material.share.revoke','material',$1::text);
end;
$$;
