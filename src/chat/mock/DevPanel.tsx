import { useState } from 'react';
import type { MockChatService } from './MockChatService';

const HOUR = 60 * 60 * 1000;

/** 測試面板：只在示範模式出現（docs/architecture.md 7.6） */
export function DevPanel({ service }: { service: MockChatService }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="dev-chip" onClick={() => setOpen(true)}>
        測試面板
      </button>
    );
  }

  return (
    <section className="dev-panel" aria-label="測試面板">
      <div className="dev-panel__head">
        <h2>測試面板</h2>
        <button type="button" className="icon-btn" aria-label="收合測試面板" onClick={() => setOpen(false)}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      <p className="dev-panel__note">
        示範模式沒有伺服器。只有同一個瀏覽器、網址開頭同樣是 {location.host} 的分頁才看得到彼此的訊息。
      </p>
      <button type="button" onClick={() => service.setOffline(true)}>模擬斷線</button>
      <button type="button" onClick={() => service.setOffline(false)}>恢復連線</button>
      <button type="button" onClick={() => service.botSay()}>讓假人說一句話</button>
      <button type="button" onClick={() => service.botFlood()}>讓假人洗版</button>
      <button type="button" onClick={() => service.fastForward(13 * HOUR)}>時間快轉 13 小時</button>
      <button type="button" onClick={() => service.fastForward(8 * 24 * HOUR)}>時間快轉 8 天</button>
      <button
        type="button"
        className="dev-panel__danger"
        onClick={() => {
          if (window.confirm('清空這台裝置上的所有示範資料？')) service.clearAll();
        }}
      >
        清空所有資料
      </button>
    </section>
  );
}
