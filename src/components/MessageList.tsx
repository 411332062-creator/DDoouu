import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../chat/types';
import { dayKey, dayLabel } from '../lib/time';
import { BubbleIcon, SpinnerIcon } from './Icons';
import { MessageBubble } from './MessageBubble';
import { NewMessagesButton } from './NewMessagesButton';

const BOTTOM_SLACK = 48;
const LOAD_OLDER_AT = 80;

interface Props {
  /** 已經濾掉被隱藏的人 */
  messages: Message[];
  myUserId: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  gapBeforeId: string | null;
  now: number;
  onLoadOlder: () => void;
  onNameClick: (userId: string, nickname: string) => void;
}

type Row =
  | { kind: 'date'; key: string; text: string }
  | { kind: 'gap'; key: string }
  | { kind: 'message'; key: string; message: Message; showName: boolean };

export function MessageList({
  messages,
  myUserId,
  hasOlder,
  loadingOlder,
  gapBeforeId,
  now,
  onLoadOlder,
  onNameClick,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const seen = useRef<{ firstId?: string; lastId?: string; count: number; height: number }>({ count: 0, height: 0 });
  const [newCount, setNewCount] = useState(0);

  const rows = useMemo(() => {
    const result: Row[] = [];
    let previous: Message | null = null;
    for (const message of messages) {
      let breakBefore = false;
      if (message.id === gapBeforeId) {
        result.push({ kind: 'gap', key: `gap-${message.id}` });
        breakBefore = true;
      }
      if (!previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)) {
        result.push({ kind: 'date', key: `date-${message.id}`, text: dayLabel(message.createdAt, now) });
        breakBefore = true;
      }
      result.push({
        kind: 'message',
        key: message.id,
        message,
        showName: breakBefore || !previous || previous.userId !== message.userId,
      });
      previous = message;
    }
    return result;
  }, [messages, gapBeforeId, now]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setNewCount(0);
  }, []);

  // 訊息有變動時決定要不要捲動
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const before = seen.current;
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;

    if (before.count === 0) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
    } else {
      // 上方載入了更舊的訊息：把畫面留在原本的位置
      if (firstId !== before.firstId && lastId === before.lastId) {
        el.scrollTop += el.scrollHeight - before.height;
      }
      if (lastId !== before.lastId) {
        const index = messages.findIndex((m) => m.id === before.lastId);
        const added = index >= 0 ? messages.slice(index + 1) : [];
        if (atBottom.current || added.some((m) => m.userId === myUserId)) {
          el.scrollTop = el.scrollHeight;
          atBottom.current = true;
          setNewCount(0);
        } else {
          setNewCount((count) => count + added.length);
        }
      }
    }
    seen.current = { firstId, lastId, count: messages.length, height: el.scrollHeight };
  }, [messages, myUserId]);

  // 訊息區大小改變（例如手機鍵盤彈出）時，原本在最底部就繼續貼著最底部
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    seen.current.height = el.scrollHeight;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    if (atBottom.current && newCount > 0) setNewCount(0);
    if (el.scrollTop < LOAD_OLDER_AT && hasOlder && !loadingOlder) onLoadOlder();
  };

  return (
    <main className="messages">
      <div className="messages__scroll" ref={scroller} onScroll={onScroll}>
        {messages.length === 0 && !hasOlder ? (
          <div className="messages__empty">
            <BubbleIcon size={48} />
            <p>還沒有人說話，來當第一個吧</p>
          </div>
        ) : (
          <div className="messages__list">
            {loadingOlder && (
              <div className="messages__loading" role="status">
                <SpinnerIcon size={18} />
                <span>正在載入更舊的訊息…</span>
              </div>
            )}
            {!hasOlder && <div className="messages__notice">只保留最近 24 小時的訊息</div>}
            {rows.map((row) => {
              if (row.kind === 'date') {
                return (
                  <div key={row.key} className="messages__date">
                    {row.text}
                  </div>
                );
              }
              if (row.kind === 'gap') {
                return (
                  <div key={row.key} className="messages__notice">
                    中間有較早的訊息未顯示
                  </div>
                );
              }
              return (
                <MessageBubble
                  key={row.key}
                  message={row.message}
                  mine={row.message.userId === myUserId}
                  showName={row.showName}
                  onNameClick={onNameClick}
                />
              );
            })}
          </div>
        )}
      </div>
      <NewMessagesButton count={newCount} onClick={() => scrollToBottom(true)} />
    </main>
  );
}
