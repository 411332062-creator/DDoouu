// 假後端（階段一）。行為照 docs/architecture.md 第 5 節的約定，
// 但資料只存在這個瀏覽器裡，同一台裝置的分頁之間用 BroadcastChannel 互通。

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
import {
  HISTORY_MS,
  NICKNAME_HOLD_MS,
  PAGE_SIZE,
  RATE_COUNT,
  RATE_WINDOW_MS,
  SINCE_MAX,
  checkMessage,
  checkNickname,
  cleanMessage,
  cleanNickname,
  nicknameKey,
} from '../rules';
import { readJSON, removeKeys, uuid, writeJSON } from '../../lib/storage';
import { BOTS, randomBot, randomLine, type Bot } from './bots';

const PREFIX = 'ddoouu.';
const DB_KEY = 'ddoouu.mock.db';
const CHANNEL = 'ddoouu.mock';
const NEVER = 9e15;
const HEARTBEAT_MS = 4000;
const PEER_TIMEOUT_MS = 12000;
const MAX_STORED = 600;

interface Hold {
  nickname: string;
  userId: string;
  slot: 'current' | 'previous';
  expiresAt: number;
}

interface Db {
  messages: Message[];
  profiles: Record<string, string>;
  holds: Record<string, Hold>;
  /** 測試面板「時間快轉」累積的毫秒數 */
  timeOffset: number;
}

type Wire =
  | { t: 'message'; message: Message }
  | { t: 'profile'; profile: Profile }
  | { t: 'here'; userId: string; tabId: string }
  | { t: 'who' }
  | { t: 'bye'; tabId: string }
  | { t: 'reload' };

type Handlers = { [K in keyof ChatEvents]: Set<(payload: ChatEvents[K]) => void> };

export class MockChatService implements ChatService {
  private handlers: Handlers = {
    'message:new': new Set(),
    'presence:sync': new Set(),
    'profile:updated': new Set(),
    'connection:changed': new Set(),
  };
  private channel: BroadcastChannel | null = null;
  private tabId = uuid();
  private userId: string;
  private entered = false;
  private connection: ConnectionState = 'online';
  private peers = new Map<string, { userId: string; seen: number }>();
  private heartbeat: number | undefined;
  private chatter: number | undefined;

  constructor() {
    // 網址加上 ?as=b 這類參數，這個分頁就會被當成另一個人
    const as = new URLSearchParams(location.search).get('as');
    const idKey = as ? `ddoouu.mock.uid.${as}` : 'ddoouu.mock.uid';
    let id = readJSON<string | null>(idKey, null);
    if (!id) {
      id = uuid();
      writeJSON(idKey, id);
    }
    this.userId = id;

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (event) => this.receive(event.data as Wire);
    }
    window.addEventListener('pagehide', () => this.post({ t: 'bye', tabId: this.tabId }));
    window.addEventListener('offline', () => this.setOffline(true));
    window.addEventListener('online', () => this.setOffline(false));
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
    return Date.now() + this.db().timeOffset;
  }

  async identify(): Promise<IdentityStatus> {
    await this.delay();
    if (this.connection === 'offline') throw new ChatError('network_error');
    const db = this.db();
    const nickname = db.profiles[this.userId];
    if (!nickname) return { status: 'new' };
    const hold = db.holds[nicknameKey(nickname)];
    if (hold && hold.userId !== this.userId) return { status: 'nickname_lost', nickname };
    return { status: 'returning', nickname };
  }

  async enter(nickname: string): Promise<EnterResult> {
    await this.delay();
    if (this.connection === 'offline') throw new ChatError('network_error');
    const profile = this.claim(nickname);
    this.entered = true;
    this.startPresence();
    this.startChatter();
    const recent = this.recentMessages();
    return {
      profile,
      messages: recent.slice(-PAGE_SIZE),
      hasOlder: recent.length > PAGE_SIZE,
    };
  }

  async rename(nickname: string): Promise<Profile> {
    await this.delay();
    if (this.connection !== 'online') throw new ChatError('not_connected');
    return this.claim(nickname);
  }

  async sendMessage(body: string): Promise<Message> {
    await this.delay();
    if (this.connection !== 'online' || !this.entered) throw new ChatError('not_connected');
    if (checkMessage(body) !== null) throw new ChatError('message_invalid');

    const db = this.db();
    const now = this.now();
    const mine = db.messages
      .filter((m) => m.userId === this.userId)
      .map((m) => Date.parse(m.createdAt))
      .filter((time) => time > now - RATE_WINDOW_MS);
    if (mine.length >= RATE_COUNT) {
      const oldest = Math.min(...mine.slice(-RATE_COUNT));
      throw new ChatError('rate_limited', { retryAfterMs: Math.max(500, oldest + RATE_WINDOW_MS - now) });
    }
    return this.insertMessage(this.userId, db.profiles[this.userId] ?? '', cleanMessage(body));
  }

  async loadOlder(before: string): Promise<{ messages: Message[]; hasOlder: boolean }> {
    await this.delay(400);
    if (this.connection === 'offline') throw new ChatError('network_error');
    const older = this.recentMessages().filter((m) => m.createdAt < before);
    return { messages: older.slice(-PAGE_SIZE), hasOlder: older.length > PAGE_SIZE };
  }

  async loadSince(after: string): Promise<{ messages: Message[]; gap: boolean }> {
    await this.delay();
    if (this.connection === 'offline') throw new ChatError('network_error');
    const newer = this.recentMessages().filter((m) => m.createdAt > after);
    if (newer.length > SINCE_MAX) return { messages: newer.slice(-PAGE_SIZE), gap: true };
    return { messages: newer, gap: false };
  }

  async lookupProfiles(userIds: string[]): Promise<Profile[]> {
    await this.delay(60);
    if (this.connection === 'offline') throw new ChatError('network_error');
    const db = this.db();
    return userIds
      .filter((userId) => db.profiles[userId])
      .map((userId) => ({ userId, nickname: db.profiles[userId] }));
  }

  leave(): void {
    this.post({ t: 'bye', tabId: this.tabId });
    this.entered = false;
    window.clearInterval(this.heartbeat);
    window.clearTimeout(this.chatter);
  }

  // ---- 測試面板用 ----

  get offline(): boolean {
    return this.connection !== 'online';
  }

  setOffline(offline: boolean): void {
    if (offline) {
      if (this.connection === 'offline') return;
      this.connection = 'offline';
      this.post({ t: 'bye', tabId: this.tabId });
      this.emit('connection:changed', 'offline');
      return;
    }
    if (this.connection !== 'offline') return;
    this.connection = 'connecting';
    this.emit('connection:changed', 'connecting');
    window.setTimeout(() => {
      if (this.connection !== 'connecting') return;
      this.connection = 'online';
      this.emit('connection:changed', 'online');
      if (this.entered) {
        this.post({ t: 'here', userId: this.userId, tabId: this.tabId });
        this.post({ t: 'who' });
        this.syncPresence();
      }
    }, 700);
  }

  botSay(bot: Bot = randomBot(), line: string = randomLine()): void {
    this.insertMessage(bot.userId, bot.nickname, line);
  }

  botFlood(): void {
    const bot = randomBot();
    for (let i = 1; i <= 12; i++) {
      window.setTimeout(() => this.botSay(bot, `洗版測試 ${i}`), i * 150);
    }
  }

  fastForward(ms: number): void {
    const db = this.db();
    db.timeOffset += ms;
    this.save(db);
    this.reloadEverywhere();
  }

  clearAll(): void {
    removeKeys(PREFIX);
    this.reloadEverywhere();
  }

  // ---- 內部 ----

  private reloadEverywhere(): void {
    this.post({ t: 'reload' });
    location.reload();
  }

  private delay(base = 140): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, base + Math.random() * 160));
  }

  private db(): Db {
    const db = readJSON<Db>(DB_KEY, { messages: [], profiles: {}, holds: {}, timeOffset: 0 });
    if (!db.profiles[BOTS[0].userId]) {
      for (const bot of BOTS) {
        db.profiles[bot.userId] = bot.nickname;
        db.holds[nicknameKey(bot.nickname)] = {
          nickname: bot.nickname,
          userId: bot.userId,
          slot: 'current',
          expiresAt: NEVER,
        };
      }
      writeJSON(DB_KEY, db);
    }
    return db;
  }

  private save(db: Db): void {
    const cutoff = Date.now() + db.timeOffset - HISTORY_MS;
    db.messages = db.messages.filter((m) => Date.parse(m.createdAt) > cutoff).slice(-MAX_STORED);
    writeJSON(DB_KEY, db);
  }

  private recentMessages(): Message[] {
    const cutoff = this.now() - HISTORY_MS;
    return this.db().messages.filter((m) => Date.parse(m.createdAt) > cutoff);
  }

  /** 登記暱稱：enter 和 rename 共用（對應階段二的資料庫函式） */
  private claim(raw: string): Profile {
    const problem = checkNickname(raw);
    if (problem) throw new ChatError('nickname_invalid', { reason: problem });

    const nickname = cleanNickname(raw);
    const key = nicknameKey(nickname);
    const db = this.db();
    const now = this.now();
    const existing = db.holds[key];

    if (existing && existing.userId !== this.userId && existing.expiresAt > now) {
      throw new ChatError('nickname_taken');
    }

    const myKeys = Object.keys(db.holds).filter((k) => db.holds[k].userId === this.userId);
    const currentKey = myKeys.find((k) => db.holds[k].slot === 'current');
    const previousKey = myKeys.find((k) => db.holds[k].slot === 'previous');
    const until = now + NICKNAME_HOLD_MS;

    if (existing && existing.userId === this.userId && existing.slot === 'current') {
      // 沿用現在的暱稱：只更新保留期限
      db.holds[key] = { ...existing, nickname, expiresAt: until };
    } else if (existing && existing.userId === this.userId && existing.slot === 'previous') {
      // 改回上一個暱稱：兩個名字互換
      if (currentKey) db.holds[currentKey] = { ...db.holds[currentKey], slot: 'previous', expiresAt: until };
      db.holds[key] = { nickname, userId: this.userId, slot: 'current', expiresAt: until };
    } else {
      // 全新的暱稱：更早的名字立刻釋出，現在的變成「上一個」
      if (previousKey) delete db.holds[previousKey];
      if (currentKey) db.holds[currentKey] = { ...db.holds[currentKey], slot: 'previous', expiresAt: until };
      db.holds[key] = { nickname, userId: this.userId, slot: 'current', expiresAt: until };
    }

    const changed = db.profiles[this.userId] !== nickname;
    db.profiles[this.userId] = nickname;
    this.save(db);

    const profile: Profile = { userId: this.userId, nickname };
    if (changed) {
      this.post({ t: 'profile', profile });
      this.emit('profile:updated', profile);
    }
    return profile;
  }

  private insertMessage(userId: string, nickname: string, body: string): Message {
    const db = this.db();
    let time = Date.now() + db.timeOffset;
    const last = db.messages[db.messages.length - 1];
    if (last && Date.parse(last.createdAt) >= time) time = Date.parse(last.createdAt) + 1;

    const message: Message = { id: uuid(), userId, nickname, body, createdAt: new Date(time).toISOString() };
    db.messages.push(message);
    this.save(db);
    this.post({ t: 'message', message });
    if (this.connection === 'online') this.emit('message:new', message);
    return message;
  }

  private post(wire: Wire): void {
    try {
      this.channel?.postMessage(wire);
    } catch {
      // 分頁正在關閉時可能送不出去
    }
  }

  private receive(wire: Wire): void {
    switch (wire.t) {
      case 'reload':
        location.reload();
        return;
      case 'who':
        if (this.entered && this.connection === 'online') {
          this.post({ t: 'here', userId: this.userId, tabId: this.tabId });
        }
        return;
      case 'here':
        this.peers.set(wire.tabId, { userId: wire.userId, seen: Date.now() });
        this.syncPresence();
        return;
      case 'bye':
        this.peers.delete(wire.tabId);
        this.syncPresence();
        return;
      case 'message':
        if (this.connection === 'online' && this.entered) this.emit('message:new', wire.message);
        return;
      case 'profile':
        if (this.connection === 'online') this.emit('profile:updated', wire.profile);
        return;
    }
  }

  private startPresence(): void {
    window.clearInterval(this.heartbeat);
    this.post({ t: 'here', userId: this.userId, tabId: this.tabId });
    this.post({ t: 'who' });
    this.heartbeat = window.setInterval(() => {
      if (this.connection !== 'online') return;
      this.post({ t: 'here', userId: this.userId, tabId: this.tabId });
      this.syncPresence();
    }, HEARTBEAT_MS);
    window.setTimeout(() => this.syncPresence(), 0);
  }

  private syncPresence(): void {
    if (!this.entered || this.connection !== 'online') return;
    const fresh = Date.now() - PEER_TIMEOUT_MS;
    for (const [tabId, peer] of this.peers) {
      if (peer.seen < fresh) this.peers.delete(tabId);
    }
    const userIds = new Set<string>([this.userId, ...BOTS.map((bot) => bot.userId)]);
    for (const peer of this.peers.values()) userIds.add(peer.userId);
    this.emit('presence:sync', { userIds: [...userIds] });
  }

  /** 假人每隔一陣子自己說一句話；最近 20 秒有人說過話就先不說，避免多個分頁一起吵 */
  private startChatter(): void {
    window.clearTimeout(this.chatter);
    const tick = () => {
      this.chatter = window.setTimeout(() => {
        const messages = this.db().messages;
        const last = messages[messages.length - 1];
        if (!last || Date.parse(last.createdAt) < this.now() - 20_000) this.botSay();
        tick();
      }, 30_000 + Math.random() * 20_000);
    };
    tick();
  }
}
