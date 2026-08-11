-- =========================================================
-- RIFT — 진입 모달 + 직업 잠금 + 코인 표시
-- Supabase → SQL Editor 에 붙여넣고 한 번 실행하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- ---------------------------------------------------------
-- 1) 직업은 게임 안에서만 정합니다
--    한 번 고르면 못 바꾸는 값이라 브라우저에서는 아예 쓸 수 없게 막습니다.
--    표시용 값은 players.job (마인크래프트 서버가 올림) 을 씁니다.
-- ---------------------------------------------------------
revoke insert (job) on public.profiles from authenticated;
revoke update (job) on public.profiles from authenticated;

-- 예전에 사이트에서 직접 넣은 값이 남아 있으면 게임 값과 어긋나 보입니다.
-- players 에 같은 닉네임이 있으면 그 값으로 맞춰 둡니다.
update public.profiles p
   set job = pl.job
  from public.players pl
 where pl.name = p.mc_name
   and coalesce(pl.job, '') <> ''
   and coalesce(p.job, '') is distinct from coalesce(pl.job, '');


-- ---------------------------------------------------------
-- 2) 사이트에 들어오면 뜨는 안내 모달
--    행은 항상 1개(id = 1)만 씁니다.
-- ---------------------------------------------------------
create table if not exists public.site_modal (
  id            int primary key default 1,
  enabled       boolean     not null default false,
  title         text        not null default '',
  body          text        not null default '',   -- 디스코드 문법
  image_url     text,
  button_label  text,
  button_url    text,
  -- 내용을 고치면 이 값을 올려서 "다시 보지 않기" 를 풀어 줍니다.
  version       int         not null default 1,
  updated_at    timestamptz not null default now(),
  constraint site_modal_one_row check (id = 1)
);

insert into public.site_modal (id) values (1) on conflict (id) do nothing;

alter table public.site_modal enable row level security;

-- 누구나 읽고, 관리자만 고칩니다.
drop policy if exists site_modal_read  on public.site_modal;
drop policy if exists site_modal_write on public.site_modal;

create policy site_modal_read  on public.site_modal for select using (true);
create policy site_modal_write on public.site_modal for update
  using (public.is_admin()) with check (public.is_admin());

grant select on public.site_modal to anon, authenticated;
grant update (enabled, title, body, image_url, button_label, button_url, version, updated_at)
  on public.site_modal to authenticated;

-- 내용이 바뀌면 판을 올려 모두에게 다시 보이게 합니다.
create or replace function public.site_modal_bump()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.title      is distinct from old.title
  or new.body       is distinct from old.body
  or new.image_url  is distinct from old.image_url
  or new.button_url is distinct from old.button_url then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists site_modal_bump_trg on public.site_modal;
create trigger site_modal_bump_trg before update on public.site_modal
  for each row execute function public.site_modal_bump();
