// 依設定決定用假後端還是 Supabase（docs/architecture.md 4.3）。
// 階段二：在 chat/supabase/ 新增連接器，然後只改這個檔案。

import { createElement, type ComponentType } from 'react';
import type { ChatService } from './types';
import { MockChatService } from './mock/MockChatService';
import { DevPanel } from './mock/DevPanel';

export interface ChatBackend {
  service: ChatService;
  /** 示範模式：顯示提示橫幅和測試面板 */
  demo: boolean;
  DevTools: ComponentType | null;
}

export function createChatBackend(): ChatBackend {
  const mode = import.meta.env.VITE_CHAT_BACKEND ?? 'mock';
  if (mode === 'supabase') {
    const ready = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    console.warn(
      ready
        ? 'Supabase 連接器要到階段二才有，先使用示範模式。'
        : '設定成正式模式但沒有提供 Supabase 的網址和公開金鑰，先使用示範模式。',
    );
  }

  const mock = new MockChatService();
  return {
    service: mock,
    demo: true,
    DevTools: () => createElement(DevPanel, { service: mock }),
  };
}
