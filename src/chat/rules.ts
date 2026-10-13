// 共用規則（docs/architecture.md 5.6）。前端和後端必須用同一套算法。

import type { NicknameProblem } from './types';

export const NICKNAME_MAX = 12;
export const MESSAGE_MAX = 500;
export const RATE_COUNT = 5;
export const RATE_WINDOW_MS = 10_000;
export const PAGE_SIZE = 50;
export const SINCE_MAX = 200;
export const HISTORY_MS = 24 * 60 * 60 * 1000;
export const NICKNAME_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** 以 Unicode 字元為單位算字數 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export function limitChars(text: string, max: number): string {
  return countChars(text) > max ? Array.from(text).slice(0, max).join('') : text;
}

const between = (code: number, from: number, to: number) => code >= from && code <= to;

/** 控制符號（含換行） */
const isControl = (code: number) => code <= 0x1f || between(code, 0x7f, 0x9f);

/** 會讓文字反向顯示的符號 */
const isBidiOverride = (code: number) => between(code, 0x202a, 0x202e) || between(code, 0x2066, 0x2069);

/** 暱稱裡不能有的字元：控制符號、零寬字元、反向符號 */
const isNicknameInvisible = (code: number) =>
  isControl(code) ||
  code === 0xad ||
  code === 0x61c ||
  between(code, 0x200b, 0x200f) ||
  between(code, 0x2028, 0x202f) ||
  between(code, 0x2060, 0x206f) ||
  code === 0xfeff;

/** 訊息保留換行（0x0a）和組合 emoji 需要的零寬連接符 */
const isMessageInvisible = (code: number) => (isControl(code) && code !== 0x0a) || isBidiOverride(code);

function strip(text: string, isBad: (code: number) => boolean): string {
  let result = '';
  for (const char of text) {
    if (!isBad(char.codePointAt(0)!)) result += char;
  }
  return result;
}

export function cleanNickname(raw: string): string {
  return strip(raw.normalize('NFC'), isNicknameInvisible).replace(/\s+/g, ' ').trim();
}

/** 比對撞名用：全形轉半形、英文轉小寫 */
export function nicknameKey(raw: string): string {
  return cleanNickname(raw).normalize('NFKC').toLowerCase();
}

export function checkNickname(raw: string): NicknameProblem | null {
  const length = countChars(cleanNickname(raw));
  if (length === 0) return 'empty';
  if (length > NICKNAME_MAX) return 'too_long';
  return null;
}

export function nicknameProblemText(problem: NicknameProblem): string {
  return problem === 'empty' ? '暱稱不能是空白' : `暱稱最多 ${NICKNAME_MAX} 個字`;
}

export function cleanMessage(raw: string): string {
  return strip(raw.replace(/\r\n?/g, '\n'), isMessageInvisible)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function checkMessage(raw: string): 'empty' | 'too_long' | null {
  const length = countChars(cleanMessage(raw));
  if (length === 0) return 'empty';
  if (length > MESSAGE_MAX) return 'too_long';
  return null;
}
