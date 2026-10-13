// 假人：示範模式裡會自動說話的假使用者。

export interface Bot {
  userId: string;
  nickname: string;
}

export const BOTS: Bot[] = [
  { userId: 'bot-1', nickname: '害羞的石虎' },
  { userId: 'bot-2', nickname: '飛快的蝸牛' },
  { userId: 'bot-3', nickname: '嘴饞的柴犬' },
];

const LINES = [
  '有人在嗎？',
  '剛下班，好累',
  '今天會下雨嗎',
  '晚餐吃什麼好',
  '我也是剛進來',
  '哈哈哈',
  '真的假的',
  '推薦一家拉麵 https://example.com/ramen',
  '外面已經在下了\n記得帶傘',
  '這裡的訊息一天後就會消失喔',
  '等一下要去運動',
  '好想放假',
];

export function randomBot(): Bot {
  return BOTS[Math.floor(Math.random() * BOTS.length)];
}

export function randomLine(): string {
  return LINES[Math.floor(Math.random() * LINES.length)];
}
