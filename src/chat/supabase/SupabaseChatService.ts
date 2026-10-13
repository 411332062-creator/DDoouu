// Supabase 連接器（階段二）：把 docs/architecture.md 第 5 節的約定翻譯成 Supabase 的操作。
// 這裡只放公開金鑰；所有不能被繞過的規則都在資料庫裡（supabase/migrations/）。

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  ChatError,
  type ChatEvents,
  type ChatService,
  type ConnectionState,
  type EnterResult,
  type IdentityStatus,
  type Message,
  type Profile,
} from '../types';
import { PAGE_SIZE, SINCE_MAX, checkMessage, checkNickname } from '../rules';

const ROOM = 'room:lobby';
const WATCHDOG_MS = 5000;

interface MessageRow {
  id: string;
  user_id: string;
  nickname: string;
  body: string;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  nickname: string;
}

interface BackendError {
  message?: string;
  code?: string;
}

type Handlers = { [K in keyof ChatEvents]: Set<(payload: ChatEvents[K]) => void> };

/** 把時間統一成固定寬度的格式，這樣用文字比大小就等於比時間先後 */
function normalizeTime(raw: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]00(?::?00)?)$/.exec(raw);
  if (match) return `${match[1]}T${match[2]}.${(match[3] ?? '').padEnd(6, '0').slice(0, 6)}+00:00`;
  return new Date(raw).toISOString().replace('Z', '000+00:00');
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    body: row.body,
    createdAt: normalizeTime(row.created_at),
  };
}

function toChatError(error: BackendError | null | undefined): ChatError {
  const message = error?.message ?? '';
  if (message.startsWith('nickname_taken') || error?.code === '23505') return new ChatError('nickname_taken');
  if (message.startsWith('nickname_invalid')) {
    return new ChatError('nickname_invalid', { reason: message.endsWith('too_long') ? 'too_long' : 'empty' });
  }
  if (message.startsWith('rate_limited')) {
    return new ChatError('rate_limited', { retryAfterMs: Number(message.split(':')[1]) || 10_000 });
  }
  if (message.startsWith('message_invalid')) return new ChatError('message_invalid');
  return new ChatError('network_error');
}

export class SupabaseChatService implements ChatService {
  private client: SupabaseClient;
  private handlers: Handlers = {
    'message:new': new Set(),
    'presence:sync': new Set(),
    'profile:updated': new Set(),
    'connection:changed': new Set(),
  };
  private channel: RealtimeChannel | null = null;
  private userId: string | null = null;
  private entered = false;
  private connection: ConnectionState = 'online';
  private clockOffset = 0;
  private watchdog: number | undefined;

  constructor(url: string, publishableKey: string) {
    this.client = createClient(url, publishableKey);

    window.addEventListener('offline', () => this.setConnection('offline'));
    window.addEventListener('online', () => this.resubscribe());
    // 手機把頁面切到背景後常會自己切斷連線，回到前景時主動檢查
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.entered && this.channel?.state !== 'joined') this.resubscribe();
    });
  }

  // ---- 約定：事件 ----

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): () => void {
    const set = this.handlers[event] as Set<(payload: ChatEvents[K]) => void>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    (this.handlers[event] as Set<(payload: ChatEvents[K]) => void>).forEach((handler) => handler(payload));
  }

  // ---- 約定：指令 ----

  now(): number {
    return Date.now() + this.clockOffset;
  }

  async identify(): Promise<IdentityStatus> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new ChatError('network_error');
    if (!data.session) return { status: 'new' };
    this.userId = data.session.user.id;

    const result = await this.client.rpc('get_my_status');
    if (result.error) throw toChatError(result.error);
    const status = result.data as { status: string; nickname?: string };
    if (status.status === 'returning' && status.nickname) return { status: 'returning', nickname: status.nickname };
    if (status.status === 'nickname_lost' && status.nickname) {
      return { status: 'nickname_lost', nickname: status.nickname };
    }
    return { status: 'new' };
  }

  async enter(nickname: string): Promise<EnterResult> {
    const problem = checkNickname(nickname);
    if (problem) throw new ChatError('nickname_invalid', { reason: problem });

    await this.ensureSession();
    let result = await this.client.rpc('enter_room', { p_nickname: nickname });
    if (result.error?.code === '23503') {
      // 這個匿名身分太久沒回來，已經被清掉了：重新領一個再試一次
      await this.client.auth.signOut({ scope: 'local' });
      this.userId = null;
      await this.ensureSession();
      result = await this.client.rpc('enter_room', { p_nickname: nickname });
    }
    if (result.error) throw toChatError(result.error);

    const claimed = result.data as { user_id: string; nickname: string; server_time: number };
    this.clockOffset = claimed.server_time - Date.now();
    this.userId = claimed.user_id;

    const history = await this.client
      .from('messages')
      .select('id,user_id,nickname,body,created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (history.error) throw toChatError(history.error);
    const rows = (history.data as MessageRow[]).map(toMessage);

    this.entered = true;
    this.subscribe();
    window.clearInterval(this.watchdog);
    this.watchdog = window.setInterval(() => {
      const state = this.channel?.state;
      if (this.entered && navigator.onLine && state !== 'joined' && state !== 'joining') this.resubscribe();
    }, WATCHDOG_MS);

    return {
      profile: { userId: claimed.user_id, nickname: claimed.nickname },
      messages: rows.slice(0, PAGE_SIZE).reverse(),
      hasOlder: rows.length > PAGE_SIZE,
    };
  }

  async rename(nickname: string): Promise<Profile> {
    if (!this.canWrite()) throw new ChatError('not_connected');
    const problem = checkNickname(nickname);
    if (problem) throw new ChatError('nickname_invalid', { reason: problem });

    const result = await this.client.rpc('rename', { p_nickname: nickname });
    if (result.error) throw toChatError(result.error);
    const claimed = result.data as { user_id: string; nickname: string };
    return { userId: claimed.user_id, nickname: claimed.nickname };
  }

  async sendMessage(body: string): Promise<Message> {
    if (!this.canWrite()) throw new ChatError('not_connected');
    if (checkMessage(body) !== null) throw new ChatError('message_invalid');

    const result = await this.client.rpc('send_message', { p_body: body });
    if (result.error) throw toChatError(result.error);
    return toMessage(result.data as MessageRow);
  }

  async loadOlder(before: string): Promise<{ messages: Message[]; hasOlder: boolean }> {
    const result = await this.client
      .from('messages')
      .select('id,user_id,nickname,body,created_at')
      .lt('created_at', before)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);
    if (result.error) throw toChatError(result.error);
    const rows = (result.data as MessageRow[]).map(toMessage);
    return { messages: rows.slice(0, PAGE_SIZE).reverse(), hasOlder: rows.length > PAGE_SIZE };
  }

  async loadSince(after: string): Promise<{ messages: Message[]; gap: boolean }> {
    const result = await this.client
      .from('messages')
      .select('id,user_id,nickname,body,created_at')
      .gt('created_at', after)
      .order('created_at', { ascending: true })
      .limit(SINCE_MAX + 1);
    if (result.error) throw toChatError(result.error);
    const rows = (result.data as MessageRow[]).map(toMessage);
    if (rows.length <= SINCE_MAX) return { messages: rows, gap: false };

    // 漏掉太多：只拿最新的一頁，中間標記有缺漏
    const latest = await this.client
      .from('messages')
      .select('id,user_id,nickname,body,created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (latest.error) throw toChatError(latest.error);
    return { messages: (latest.data as MessageRow[]).map(toMessage).reverse(), gap: true };
  }

  async lookupProfiles(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const result = await this.client.from('profiles').select('user_id,nickname').in('user_id', userIds);
    if (result.error) throw toChatError(result.error);
    return (result.data as ProfileRow[]).map((row) => ({ userId: row.user_id, nickname: row.nickname }));
  }

  leave(): void {
    this.entered = false;
    window.clearInterval(this.watchdog);
    const channel = this.channel;
    this.channel = null;
    if (channel) void this.client.removeChannel(channel);
  }

  // ---- 內部 ----

  private canWrite(): boolean {
    return this.entered && this.connection === 'online' && navigator.onLine;
  }

  /** 沒有身分憑證就做匿名登入。只在按下「進入聊天室」時才做，只看歡迎畫面的人不佔名額 */
  private async ensureSession(): Promise<void> {
    const current = await this.client.auth.getSession();
    if (current.data.session) {
      this.userId = current.data.session.user.id;
      return;
    }
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error || !data.user) throw new ChatError('network_error');
    this.userId = data.user.id;
  }

  private setConnection(next: ConnectionState): void {
    if (this.connection === next) return;
    this.connection = next;
    this.emit('connection:changed', next);
  }

  private resubscribe(): void {
    if (!this.entered) return;
    this.setConnection('connecting');
    this.subscribe();
  }

  private subscribe(): void {
    const userId = this.userId;
    if (!userId) return;

    const previous = this.channel;
    this.channel = null;
    if (previous) void this.client.removeChannel(previous);

    const channel = this.client.channel(ROOM, { config: { presence: { key: userId } } });
    this.channel = channel;

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (channel === this.channel) this.emit('message:new', toMessage(payload.new as MessageRow));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const row = payload.new as Partial<ProfileRow>;
        if (channel === this.channel && row.user_id && row.nickname) {
          this.emit('profile:updated', { userId: row.user_id, nickname: row.nickname });
        }
      })
      .on('presence', { event: 'sync' }, () => {
        // 名單只帶身分編號，暱稱由畫面另外向資料庫查（docs/architecture.md 9.3）
        if (channel === this.channel) {
          this.emit('presence:sync', { userIds: Object.keys(channel.presenceState()) });
        }
      })
      .subscribe((status) => {
        // 舊頻道被換掉時也會回報「已關閉」，那不算斷線
        if (channel !== this.channel) return;
        if (status === 'SUBSCRIBED') {
          this.setConnection('online');
          void channel.track({ user_id: userId });
        } else {
          this.setConnection('offline');
        }
      });
  }
}
