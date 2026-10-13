# DDoouu

不用註冊、隨機給暱稱、所有人在同一個房間用文字聊天的匿名聊天室，前端放在 GitHub Pages，後端用 Supabase。

## 開始工作前

開始任何工作前，先讀 [docs/architecture.md](docs/architecture.md)。畫面行為、通訊約定、資料夾結構、金鑰處理都以它為準。

## 目前階段

目前在**階段一**：還沒接 Supabase，前端用假後端（示範模式）。定義見 docs/architecture.md 第 4 節，完成標準見第 13.1 節。

## 金鑰

不可以把金鑰檔案 commit 進 git。

- `.env`、`.env.local` 和其他 `.env.*` 檔案只留在本機，`.gitignore` 已經排除；只有 `.env.example`（值留空）可以進 repo。
- Supabase 秘密金鑰（`sb_secret_` 開頭或 service_role）和資料庫密碼不可以出現在專案資料夾的任何檔案裡。
- commit 前先確認要記錄的檔案裡沒有上述內容。細節見 docs/architecture.md 第 8 節。
