// 畫面用的資料狀態：訊息、線上名單、連線狀態、未讀數。
// 只透過 chat/types.ts 的約定跟後端講話，不知道後面是假後端還是 Supabase。

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  ChatError,
  type ChatErrorCode,
  type ChatService,
  type ConnectionState,
  type IdentityStatus,
  type Message,
  type NicknameProblem,
  type Profile,
} from '../chat/types';
import { RATE_COUNT, RATE_WINDOW_MS } from '../chat/rules';
import { randomNickname } from '../lib/randomNickname';
import { APP_NAME } from '../lib/config';

/** 離線的人先等 30 秒才從名單移除，避免網路不穩時名字閃來閃去 */
const PRESENCE_GRACE_MS = 30_000;
const AUTO_NICKNAME_TRIES = 5;

export interface ChatFailure {
  code: ChatErrorCode;
  reason?: NicknameProblem;
}

export interface ChatState {
  phase: 'loading' | 'welcome' | 'chat';
  identity: IdentityStatus | null;
  identifyFailed: boolean;
  me: Profile | null;
  messages: Message[];
  hasOlder: boolean;
  loadingOlder: boolean;
  /** 斷線太久、中間訊息沒補齊時，缺漏提示要顯示在這則訊息之前 */
  gapBeforeId: string | null;
  onlineIds: string[];
  profiles: Record<string, string>;
  connection: ConnectionState;
  /** 發太快被鎖到什麼時候（裝置時鐘的毫秒），0 表示沒被鎖 */
  rateLockedUntil: number;
}

const INITIAL: ChatState = {
  phase: 'loading',
  identity: null,
  identifyFailed: false,
  me: null,
  messages: [],
  hasOlder: false,
  loadingOlder: false,
  gapBeforeId: null,
  onlineIds: [],
  profiles: {},
  connection: 'online',
  rateLockedUntil: 0,
};

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) =>
    a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
  );
}

function toFailure(error: unknown): ChatFailure {
  if (error instanceof ChatError) return { code: error.code, reason: error.reason };
  return { code: 'network_error' };
}

export function useChat(service: ChatService, isHiddenRef: RefObject<(userId: string) => boolean>) {
  const [state, setState] = useState<ChatState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const [backgroundUnread, setBackgroundUnread] = useState(0);
  const sendTimes = useRef<number[]>([]);
  const graceTimers = useRef(new Map<string, number>());
  const catchingUp = useRef(false);

  const patch = useCallback((changes: Partial<ChatState>) => {
    setState((s) => ({ ...s, ...changes }));
  }, []);

  const ensureProfiles = useCallback(
    async (userIds: string[]) => {
      const unknown = userIds.filter((id) => !(id in stateRef.current.profiles));
      if (unknown.length === 0) return;
      try {
        const found = await service.lookupProfiles(unknown);
        setState((s) => {
          const profiles = { ...s.profiles };
          for (const profile of found) profiles[profile.userId] = profile.nickname;
          return { ...s, profiles };
        });
      } catch {
        // 查不到就先顯示不出暱稱，下次名單更新時會再試
      }
    },
    [service],
  );

  const identify = useCallback(async () => {
    patch({ phase: 'loading', identifyFailed: false });
    try {
      const identity = await service.identify();
      patch({ phase: 'welcome', identity });
    } catch {
      patch({ phase: 'welcome', identifyFailed: true });
    }
  }, [service, patch]);

  /** autoRetry：暱稱是系統抽的、使用者沒改過，撞名時自動重抽 */
  const enter = useCallback(
    async (nickname: string, autoRetry: boolean): Promise<ChatFailure | null> => {
      let candidate = nickname;
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await service.enter(candidate);
          setState((s) => ({
            ...s,
            phase: 'chat',
            me: result.profile,
            messages: result.messages,
            hasOlder: result.hasOlder,
            gapBeforeId: null,
            profiles: { ...s.profiles, [result.profile.userId]: result.profile.nickname },
          }));
          return null;
        } catch (error) {
          const failure = toFailure(error);
          if (failure.code === 'nickname_taken' && autoRetry && attempt < AUTO_NICKNAME_TRIES) {
            candidate = randomNickname(candidate);
            continue;
          }
          return failure;
        }
      }
    },
    [service],
  );

  const rename = useCallback(
    async (nickname: string): Promise<ChatFailure | null> => {
      try {
        const profile = await service.rename(nickname);
        setState((s) => ({ ...s, me: profile, profiles: { ...s.profiles, [profile.userId]: profile.nickname } }));
        return null;
      } catch (error) {
        return toFailure(error);
      }
    },
    [service],
  );

  const send = useCallback(
    async (body: string): Promise<ChatFailure | null> => {
      const now = Date.now();
      const recent = sendTimes.current.filter((time) => time > now - RATE_WINDOW_MS);
      sendTimes.current = recent;
      if (recent.length >= RATE_COUNT) {
        patch({ rateLockedUntil: recent[recent.length - RATE_COUNT] + RATE_WINDOW_MS });
        return { code: 'rate_limited' };
      }
      try {
        const message = await service.sendMessage(body);
        sendTimes.current.push(Date.now());
        setState((s) => ({ ...s, messages: mergeMessages(s.messages, [message]) }));
        return null;
      } catch (error) {
        if (error instanceof ChatError && error.code === 'rate_limited') {
          patch({ rateLockedUntil: Date.now() + (error.retryAfterMs ?? RATE_WINDOW_MS) });
        }
        return toFailure(error);
      }
    },
    [service, patch],
  );

  const loadOlder = useCallback(async () => {
    const s = stateRef.current;
    if (s.loadingOlder || !s.hasOlder || s.messages.length === 0) return;
    patch({ loadingOlder: true });
    try {
      const result = await service.loadOlder(s.messages[0].createdAt);
      setState((cur) => ({
        ...cur,
        loadingOlder: false,
        hasOlder: result.hasOlder,
        messages: mergeMessages(cur.messages, result.messages),
      }));
    } catch {
      patch({ loadingOlder: false });
    }
  }, [service, patch]);

  /** 補上斷線或頁面在背景期間漏掉的訊息 */
  const catchUp = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== 'chat' || catchingUp.current) return;
    catchingUp.current = true;
    try {
      const last = s.messages[s.messages.length - 1];
      const result = await service.loadSince(last ? last.createdAt : new Date(0).toISOString());
      setState((cur) => ({
        ...cur,
        messages: mergeMessages(cur.messages, result.messages),
        gapBeforeId: result.gap && result.messages.length > 0 ? result.messages[0].id : cur.gapBeforeId,
        hasOlder: cur.hasOlder || result.gap,
      }));
    } catch {
      // 還連不上，等下一次連線恢復
    } finally {
      catchingUp.current = false;
    }
  }, [service]);

  // 打開網頁時先查詢身分
  useEffect(() => {
    void identify();
  }, [identify]);

  // 接收後端的事件
  useEffect(() => {
    const offMessage = service.on('message:new', (message) => {
      setState((s) => (s.phase === 'chat' ? { ...s, messages: mergeMessages(s.messages, [message]) } : s));
      const me = stateRef.current.me;
      if (document.hidden && message.userId !== me?.userId && !isHiddenRef.current?.(message.userId)) {
        setBackgroundUnread((count) => count + 1);
      }
    });

    const offProfile = service.on('profile:updated', (profile) => {
      setState((s) => ({
        ...s,
        profiles: { ...s.profiles, [profile.userId]: profile.nickname },
        // 同一個人開兩個分頁時，另一個分頁改名這裡也要跟著變
        me: s.me && s.me.userId === profile.userId ? profile : s.me,
      }));
    });

    const offPresence = service.on('presence:sync', ({ userIds }) => {
      const present = new Set(userIds);
      for (const id of userIds) {
        const timer = graceTimers.current.get(id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          graceTimers.current.delete(id);
        }
      }
      for (const id of stateRef.current.onlineIds) {
        if (present.has(id) || graceTimers.current.has(id)) continue;
        const timer = window.setTimeout(() => {
          graceTimers.current.delete(id);
          setState((s) => ({ ...s, onlineIds: s.onlineIds.filter((other) => other !== id) }));
        }, PRESENCE_GRACE_MS);
        graceTimers.current.set(id, timer);
      }
      setState((s) => {
        const merged = new Set([...s.onlineIds, ...userIds]);
        return merged.size === s.onlineIds.length ? s : { ...s, onlineIds: [...merged] };
      });
      void ensureProfiles(userIds);
    });

    const offConnection = service.on('connection:changed', (connection) => {
      const wasOffline = stateRef.current.connection !== 'online';
      patch({ connection });
      if (connection === 'online' && wasOffline) void catchUp();
    });

    const timers = graceTimers.current;
    return () => {
      offMessage();
      offProfile();
      offPresence();
      offConnection();
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [service, isHiddenRef, ensureProfiles, catchUp, patch]);

  // 頁面回到前景：未讀數歸零，並主動補一次訊息（手機切到背景後連線常被系統切斷）
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      setBackgroundUnread(0);
      if (stateRef.current.connection === 'online') void catchUp();
    };
    const onPageHide = () => service.leave();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [service, catchUp]);

  // 分頁標題的未讀數
  useEffect(() => {
    document.title = backgroundUnread > 0 ? `(${backgroundUnread}) ${APP_NAME}` : APP_NAME;
  }, [backgroundUnread]);

  return { state, identify, enter, rename, send, loadOlder, ensureProfiles, now: () => service.now() };
}

export type ChatStore = ReturnType<typeof useChat>;
