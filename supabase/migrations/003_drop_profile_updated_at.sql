-- 匿名聊天室：移除個人資料表裡「最後一次改名的時間」
-- 這個欄位沒有用途，卻讓所有人看得到某個人什麼時候改過名。
--
-- 用法：先把更新過的 001_schema.sql 整段重新執行一次（讓函式不再使用這個欄位），
--       成功之後再執行這個檔案。順序不能反過來。可以重複執行。

alter table public.profiles drop column if exists updated_at;
