// 依設定決定用假後端還是 Supabase（docs/architecture.md 4.3）。
// 畫面不知道用的是哪一個；要切換只改設定值 VITE_CHAT_BACKEND。

import { createElement, type ComponentType } from 'react';
import type { ChatService } from './types';
import { MockChatService } from './mock/MockChatService';
import { DevPanel } from './mock/DevPanel';
import { SupabaseChatService } from './supabase/SupabaseChatService';

export interface ChatBackend {
  service: ChatService;
  /** 示範模式：顯示提示橫幅和測試面板 */
  demo: boolean;
  DevTools: ComponentType | null;
}

export function createChatBackend(): ChatBackend {
  const mode = import.meta.env.VITE_CHAT_BACKEND ?? 'mock';
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (mode === 'supabase') {
    if (url && key) {
      return { service: new SupabaseChatService(url, key), demo: false, DevTools: null };
    }
    console.warn('設定成正式模式但沒有提供 Supabase 的網址和公開金鑰，先使用示範模式。');
  }

  const mock = new MockChatService();
  return {
    service: mock,
    demo: true,
    DevTools: () => createElement(DevPanel, { service: mock }),
  };
}
