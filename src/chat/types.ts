// 通訊約定（docs/architecture.md 第 5 節）。
// 畫面只認得這個檔案和 rules.ts；假後端和 Supabase 連接器都必須符合這裡的定義。

export interface Message {
  id: string;
  userId: string;
  /** 發訊息當下的暱稱，之後改名不會變 */
  nickname: string;
  body: string;
  /** 後端時鐘的世界標準時間（ISO 8601） */
  createdAt: string;
}

export interface Profile {
  userId: string;
  nickname: string;
}

export type IdentityStatus =
  | { status: 'new' }
  | { status: 'returning'; nickname: string }
  | { status: 'nickname_lost'; nickname: string };

export type ConnectionState = 'connecting' | 'online' | 'offline';

export type ChatErrorCode =
  | 'nickname_taken'
  | 'nickname_invalid'
  | 'rate_limited'
  | 'message_invalid'
  | 'not_connected'
  | 'network_error';

export type NicknameProblem = 'empty' | 'too_long';

export class ChatError extends Error {
  code: ChatErrorCode;
  /** nickname_invalid 時的原因 */
  reason?: NicknameProblem;
  /** rate_limited 時還要等多久 */
  retryAfterMs?: number;

  constructor(code: ChatErrorCode, detail: { reason?: NicknameProblem; retryAfterMs?: number } = {}) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
    this.reason = detail.reason;
    this.retryAfterMs = detail.retryAfterMs;
  }
}

export interface ChatEvents {
  'message:new': Message;
  'presence:sync': { userIds: string[] };
  'profile:updated': Profile;
  'connection:changed': ConnectionState;
}

export interface EnterResult {
  profile: Profile;
  /** 最近的訊息，由舊到新，最多 50 則 */
  messages: Message[];
  hasOlder: boolean;
}

export interface ChatService {
  /** 打開網頁時查詢「我是誰」 */
  identify(): Promise<IdentityStatus>;
  /** 按下「進入聊天室」 */
  enter(nickname: string): Promise<EnterResult>;
  rename(nickname: string): Promise<Profile>;
  sendMessage(body: string): Promise<Message>;
  /** 比 before 更舊的訊息，最多 50 則 */
  loadOlder(before: string): Promise<{ messages: Message[]; hasOlder: boolean }>;
  /** after 之後的訊息；超過 200 則時只回最新 50 則並標記 gap */
  loadSince(after: string): Promise<{ messages: Message[]; gap: boolean }>;
  lookupProfiles(userIds: string[]): Promise<Profile[]>;
  leave(): void;
  /** 後端時鐘現在的時間（毫秒），用來判斷「今天、昨天」 */
  now(): number;
  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): () => void;
}
