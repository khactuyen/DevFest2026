-- Resolve a lesson through its published curriculum pin, while respecting the
-- material owner's current visibility, unpublication and moderation decisions.
create function public.read_curriculum_material(curriculum_id uuid,lesson_id text) returns jsonb
language sql stable security definer set search_path='' as $$
  select r.reader_json || jsonb_build_object('visibility',m.visibility)
  from public.curricula c
  join public.curriculum_revision_materials p on p.curriculum_id=c.id and p.curriculum_revision=c.published_revision
  join public.materials m on m.id=p.material_id
  join public.material_revisions r on r.material_id=p.material_id and r.revision_no=p.material_revision
  where c.id=$1 and p.lesson_id=$2 and c.owner_user_id is not null and c.status='published'
    and m.owner_id is not null and m.status='published' and m.published_revision is not null and m.visibility='public' and not m.moderated;
$$;
revoke all on function public.read_curriculum_material(uuid,text) from public;
grant execute on function public.read_curriculum_material(uuid,text) to anon,authenticated;

-- Explicit worker/operator grants; regular requests always use anon + user JWT.
grant all on public.profiles,public.user_access,public.audit_events,public.ai_runs,public.material_revisions,public.curriculum_revisions,public.curriculum_revision_materials,public.material_share_links to service_role;
grant usage,select on all sequences in schema public to service_role;
