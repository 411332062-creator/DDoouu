const DAY_MS = 24 * 60 * 60 * 1000;

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 使用者當地的日期，用來判斷兩則訊息是不是同一天 */
export function dayKey(iso: string | number): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayLabel(iso: string, now: number): string {
  const key = dayKey(iso);
  if (key === dayKey(now)) return '今天';
  if (key === dayKey(now - DAY_MS)) return '昨天';
  const d = new Date(iso);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
