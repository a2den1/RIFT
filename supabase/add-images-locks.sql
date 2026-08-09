-- =========================================================
-- 이미지 교체 + 탭 잠금 기능 추가
-- Supabase → SQL Editor 에 붙여넣고 Run 하세요. 여러 번 실행해도 안전합니다.
-- =========================================================

-- 사이트 이미지. 관리자 페이지에서 주소를 바꿉니다.
create table if not exists public.site_images (
  key         text primary key,
  url         text not null,
  updated_at  timestamptz not null default now()
);

-- 탭 잠금. locked 가 true 면 해당 페이지가 막히고 reason 이 표시됩니다.
create table if not exists public.tab_locks (
  page        text primary key,
  locked      boolean not null default false,
  reason      text,
  updated_at  timestamptz not null default now()
);

insert into public.tab_locks (page, locked) values
  ('index', false), ('play', false), ('guide', false),
  ('league', false), ('ranking', false), ('support', false)
on conflict (page) do nothing;

-- RLS — 읽기는 누구나, 쓰기는 관리자만
alter table public.site_images enable row level security;
alter table public.tab_locks   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['site_images','tab_locks'] loop
    execute format('drop policy if exists "%s_read"  on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all to authenticated
         using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- PostgREST 가 새 테이블을 바로 인식하도록 스키마 캐시를 갱신합니다.
-- 이걸 빠뜨리면 방금 만든 테이블인데도 "찾을 수 없다"는 오류가 납니다.
notify pgrst, 'reload schema';
