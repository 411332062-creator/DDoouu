import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 的網址是 https://帳號.github.io/DDoouu/，網站不在網址最上層，
// 所以要告訴打包工具路徑前面有 /DDoouu/。repo 改名時這裡要跟著改。
export default defineConfig({
  base: '/DDoouu/',
  plugins: [react()],
});
