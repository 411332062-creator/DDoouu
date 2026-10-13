-- 匿名聊天室：定時工作
-- 用法：在 001_schema.sql 執行成功之後，整段貼到 Supabase 後台的 SQL Editor 執行。可以重複執行。

create extension if not exists pg_cron with schema pg_catalog;

-- 每小時整點：刪除超過 24 小時的訊息
select cron.schedule(
  'chat-delete-old-messages',
  '0 * * * *',
  $$delete from public.messages where created_at < now() - interval '24 hours'$$
);

-- 每天一次：清掉超過 30 天沒回來的匿名身分（他們的個人資料和暱稱保留會一起刪除）
-- 「現在的暱稱」保留到最後一次進入後 7 天，所以保留期限早於 23 天前，就代表超過 30 天沒進來
select cron.schedule(
  'chat-delete-stale-anonymous-users',
  '30 19 * * *',
  $$
  delete from auth.users u
  where u.is_anonymous is true
    and u.created_at < now() - interval '30 days'
    and not exists (
      select 1 from public.nickname_holds h
      where h.user_id = u.id and h.expires_at > now() - interval '23 days'
    )
  $$
);
