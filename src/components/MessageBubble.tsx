import { useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '../chat/types';
import { formatTime } from '../lib/time';

/** 超過 12 行就收合（行高 22px，加上下內距 16px） */
const COLLAPSED_HEIGHT = 12 * 22 + 16;

interface Props {
  message: Message;
  mine: boolean;
  showName: boolean;
  onNameClick: (userId: string, nickname: string) => void;
}

export function MessageBubble({ message, mine, showName, onNameClick }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tooLong, setTooLong] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el) setTooLong(el.scrollHeight > COLLAPSED_HEIGHT + 4);
  }, [message.body]);

  const collapsed = tooLong && !expanded;

  return (
    <div className={mine ? 'msg msg--mine' : 'msg msg--other'}>
      {!mine && showName && (
        <button type="button" className="msg__name" onClick={() => onNameClick(message.userId, message.nickname)}>
          {message.nickname}
        </button>
      )}
      <div className="msg__line">
        {/* 內容一律當純文字顯示，網址不轉成連結 */}
        <div
          ref={bodyRef}
          className="msg__body"
          style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
        >
          {message.body}
        </div>
        <time className="msg__time" dateTime={message.createdAt}>
          {formatTime(message.createdAt)}
        </time>
      </div>
      {collapsed && (
        <button type="button" className="msg__expand" onClick={() => setExpanded(true)}>
          顯示全部
        </button>
      )}
    </div>
  );
}
