import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { MESSAGE_MAX, checkMessage, countChars, limitChars } from '../chat/rules';
import type { ChatFailure } from '../state/chatStore';
import { SendIcon } from './Icons';

const MAX_ROWS = 4;
const LINE_HEIGHT = 22;
const PADDING = 22;

interface Props {
  offline: boolean;
  rateLockedUntil: number;
  onSend: (body: string) => Promise<ChatFailure | null>;
}

/** 手機（觸控為主）的 Enter 是換行；電腦的 Enter 是送出 */
const enterSends = () => !window.matchMedia('(pointer: coarse)').matches;

export function Composer({ offline, rateLockedUntil, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const field = useRef<HTMLTextAreaElement>(null);

  // 發太快的倒數
  useEffect(() => {
    const update = () => setWaitSeconds(Math.max(0, Math.ceil((rateLockedUntil - Date.now()) / 1000)));
    update();
    if (rateLockedUntil <= Date.now()) return;
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [rateLockedUntil]);

  // 輸入框隨內容長高，最多 4 行
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT + PADDING)}px`;
  }, [draft]);

  const rateLocked = waitSeconds > 0;
  const locked = offline || rateLocked;
  const canSend = !locked && !sending && checkMessage(draft) === null;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setFailed(false);
    const failure = await onSend(draft);
    setSending(false);
    if (failure === null) {
      setDraft('');
      field.current?.focus();
    } else if (failure.code === 'network_error' || failure.code === 'message_invalid') {
      // 送出失敗時保留已經打的字，讓使用者自己再按一次
      setFailed(true);
    }
  };

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    // 輸入法選字途中不截斷，否則注音會打不出字
    const composing = (event.nativeEvent as InputEvent).isComposing;
    setDraft(composing ? value : limitChars(value, MESSAGE_MAX));
    setFailed(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // 輸入法選字時按的 Enter 不算送出
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!enterSends()) return;
    event.preventDefault();
    void submit();
  };

  return (
    <footer className="composer">
      {rateLocked && (
        <div className="composer__notice" role="status">
          你發太快了，請稍等 {waitSeconds} 秒
        </div>
      )}
      {failed && !locked && (
        <div className="composer__notice" role="alert">
          連線有問題，請再試一次
        </div>
      )}
      <div className="composer__row">
        <textarea
          ref={field}
          className="composer__field"
          aria-label="訊息內容"
          placeholder="輸入訊息…"
          rows={1}
          value={draft}
          disabled={locked}
          onChange={onChange}
          onCompositionEnd={(event) => setDraft(limitChars(event.currentTarget.value, MESSAGE_MAX))}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="composer__send" aria-label="發送" disabled={!canSend} onClick={() => void submit()}>
          <SendIcon size={22} />
        </button>
      </div>
      <div className="composer__count">還能輸入 {Math.max(0, MESSAGE_MAX - countChars(draft))} 個字</div>
    </footer>
  );
}
