-- Teacher uploads remain private; the application checks material visibility
-- before streaming an object to readers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-assets', 'material-assets', false, 2000000,
  array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
