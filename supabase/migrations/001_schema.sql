-- 匿名聊天室：資料表、權限規則、資料庫函式、即時推送
-- 用法：整段貼到 Supabase 後台的 SQL Editor 執行。可以重複執行，不會弄壞已有的資料。
-- 規則對應 docs/architecture.md 5.6 與 src/chat/rules.ts，兩邊要一致。

-- ============================================================
-- 資料表
-- ============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists messages_created_at_idx on public.messages (created_at);
create index if not exists messages_user_created_idx on public.messages (user_id, created_at);

-- 暱稱保留：同一個比對用暱稱只能有一筆，靠主鍵保證
create table if not exists public.nickname_holds (
  nickname_key text primary key,
  nickname text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  slot text not null check (slot in ('current', 'previous')),
  expires_at timestamptz not null
);

create index if not exists nickname_holds_user_idx on public.nickname_holds (user_id);

-- ============================================================
-- 權限規則（RLS）：所有人只能讀，寫入只能透過下面的函式
-- ============================================================

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.nickname_holds enable row level security;

revoke all on public.profiles, public.messages, public.nickname_holds from anon, authenticated;
grant select on public.profiles, public.messages to authenticated;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "read recent messages" on public.messages;
create policy "read recent messages" on public.messages
  for select to authenticated using (created_at > now() - interval '24 hours');

-- nickname_holds 沒有任何規則，所以沒有人可以直接讀寫

-- ============================================================
-- 共用規則
-- ============================================================

-- 暱稱：去掉控制符號、零寬字元、反向符號，連續空白縮成一個，去掉前後空白
create or replace function public.chat_clean_nickname(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        normalize(coalesce(raw, ''), NFC),
        '[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159) || chr(173) || chr(1564)
            || chr(8203) || '-' || chr(8207) || chr(8232) || '-' || chr(8239)
            || chr(8288) || '-' || chr(8303) || chr(65279) || ']',
        '', 'g'),
      '[ ' || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8287) || chr(12288) || ']+',
      ' ', 'g'),
    ' ');
$$;

-- 比對撞名用：全形轉半形、英文轉小寫
create or replace function public.chat_nickname_key(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(normalize(public.chat_clean_nickname(raw), NFKC));
$$;

-- 訊息：統一換行、去掉控制符號和反向符號、三個以上的換行縮成兩個、去掉前後空白
create or replace function public.chat_clean_message(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(raw, ''), chr(13) || chr(10) || '?', chr(10), 'g'),
        '[' || chr(1) || '-' || chr(9) || chr(11) || '-' || chr(31) || chr(127) || '-' || chr(159)
            || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']',
        '', 'g'),
      chr(10) || '{3,}', chr(10) || chr(10), 'g'),
    '^[ ' || chr(10) || chr(160) || chr(5760) || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233)
          || chr(8239) || chr(8287) || chr(12288) || chr(65279) || ']+|[ ' || chr(10) || chr(160) || chr(5760)
          || chr(8192) || '-' || chr(8202) || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288)
          || chr(65279) || ']+$',
    '', 'g');
$$;

-- ============================================================
-- 登記暱稱（enter_room 和 rename 共用，不對外開放）
-- ============================================================

create or replace function public.chat_claim_nickname(p_nickname text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := public.chat_clean_nickname(p_nickname);
  v_key text := public.chat_nickname_key(p_nickname);
  v_now timestamptz := clock_timestamp();
  v_until timestamptz := clock_timestamp() + interval '7 days';
  v_existing public.nickname_holds%rowtype;
  v_mine boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_nickname) = 0 then
    raise exception 'nickname_invalid:empty';
  end if;
  if char_length(v_nickname) > 12 then
    raise exception 'nickname_invalid:too_long';
  end if;

  -- 同一個人、同一個暱稱的請求排隊處理，兩個人同時搶同一個名字只會有一個成功
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(v_key, 2));

  select * into v_existing from public.nickname_holds where nickname_key = v_key;

  if found then
    if v_existing.user_id = v_uid then
      v_mine := true;
    elsif v_existing.expires_at > v_now then
      raise exception 'nickname_taken';
    else
      -- 別人的保留已經過期：釋出
      delete from public.nickname_holds where nickname_key = v_key;
    end if;
  end if;

  if v_mine and v_existing.slot = 'current' then
    -- 沿用現在的暱稱：只更新保留期限
    update public.nickname_holds
      set nickname = v_nickname, expires_at = v_until
      where nickname_key = v_key;
  elsif v_mine and v_existing.slot = 'previous' then
    -- 改回上一個暱稱：兩個名字互換
    update public.nickname_holds
      set slot = 'previous', expires_at = v_until
      where user_id = v_uid and slot = 'current';
    update public.nickname_holds
      set slot = 'current', nickname = v_nickname, expires_at = v_until
      where nickname_key = v_key;
  else
    -- 全新的暱稱：更早的名字立刻釋出，現在的變成「上一個」
    delete from public.nickname_holds where user_id = v_uid and slot = 'previous';
    update public.nickname_holds
      set slot = 'previous', expires_at = v_until
      where user_id = v_uid and slot = 'current';
    insert into public.nickname_holds (nickname_key, nickname, user_id, slot, expires_at)
      values (v_key, v_nickname, v_uid, 'current', v_until);
  end if;

  -- 個人資料只存身分編號和暱稱，不記錄任何時間，別人看不出這個人什麼時候上線或改名
  insert into public.profiles (user_id, nickname)
    values (v_uid, v_nickname)
    on conflict (user_id) do update
      set nickname = excluded.nickname
      where public.profiles.nickname is distinct from excluded.nickname;

  return json_build_object(
    'user_id', v_uid,
    'nickname', v_nickname,
    'server_time', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );
end;
$$;

-- ============================================================
-- 對外開放的四個函式
-- ============================================================

create or replace function public.get_my_status()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select nickname into v_nickname from public.profiles where user_id = v_uid;
  if not found then
    return json_build_object('status', 'new');
  end if;

  select user_id into v_owner from public.nickname_holds
    where nickname_key = public.chat_nickname_key(v_nickname);
  if found and v_owner <> v_uid then
    return json_build_object('status', 'nickname_lost', 'nickname', v_nickname);
  end if;

  return json_build_object('status', 'returning', 'nickname', v_nickname);
end;
$$;

create or replace function public.enter_room(p_nickname text)
returns json
language sql
security definer
set search_path = ''
as $$
  select public.chat_claim_nickname(p_nickname);
$$;

create or replace function public.rename(p_nickname text)
returns json
language sql
security definer
set search_path = ''
as $$
  select public.chat_claim_nickname(p_nickname);
$$;

create or replace function public.send_message(p_body text)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text;
  v_body text := public.chat_clean_message(p_body);
  v_now timestamptz;
  v_count int;
  v_oldest timestamptz;
  v_row public.messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 500 then
    raise exception 'message_invalid';
  end if;

  select nickname into v_nickname from public.profiles where user_id = v_uid;
  if not found then
    raise exception 'not_entered';
  end if;

  -- 同一個人的訊息排隊處理，同時送很多則也繞不過速度限制
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 3));
  v_now := clock_timestamp();

  -- 任意連續 10 秒內最多 5 則
  select count(*), min(created_at) into v_count, v_oldest
    from (
      select created_at from public.messages
        where user_id = v_uid and created_at > v_now - interval '10 seconds'
        order by created_at desc
        limit 5
    ) recent;

  if v_count >= 5 then
    raise exception 'rate_limited:%',
      greatest(500, ceil(extract(epoch from (v_oldest + interval '10 seconds' - v_now)) * 1000))::bigint;
  end if;

  -- 身分編號和暱稱由這裡填入，不接受外部指定
  insert into public.messages (user_id, nickname, body, created_at)
    values (v_uid, v_nickname, v_body, v_now)
    returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function
  public.chat_clean_nickname(text),
  public.chat_nickname_key(text),
  public.chat_clean_message(text),
  public.chat_claim_nickname(text),
  public.get_my_status(),
  public.enter_room(text),
  public.rename(text),
  public.send_message(text)
from public, anon, authenticated;

grant execute on function
  public.get_my_status(),
  public.enter_room(text),
  public.rename(text),
  public.send_message(text)
to authenticated;

-- ============================================================
-- 即時推送：訊息和個人資料有變動時通知所有連線中的瀏覽器
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
