-- =========================================================
-- 이미지 파일 업로드 (Supabase Storage)
-- SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- add-images-locks.sql 과 fix-admin.sql 을 먼저 실행해야 합니다.
-- =========================================================

-- 공개 버킷. 읽기는 누구나, 올리고 지우는 건 관리자만.
insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do update set public = true;

drop policy if exists "site_read"   on storage.objects;
drop policy if exists "site_insert" on storage.objects;
drop policy if exists "site_update" on storage.objects;
drop policy if exists "site_delete" on storage.objects;

create policy "site_read" on storage.objects
  for select using (bucket_id = 'site');

create policy "site_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site' and public.is_admin());

create policy "site_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site' and public.is_admin())
  with check (bucket_id = 'site' and public.is_admin());

create policy "site_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site' and public.is_admin());

notify pgrst, 'reload schema';
