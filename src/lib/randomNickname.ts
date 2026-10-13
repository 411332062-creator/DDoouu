const ADJECTIVES = [
  '愛睏的', '害羞的', '飛快的', '嘴饞的', '發呆的', '散步的', '迷路的', '偷吃的',
  '打呵欠的', '愛跳舞的', '怕冷的', '早起的', '熬夜的', '愛唱歌的', '慢吞吞的', '好奇的',
];

const ANIMALS = [
  '水獺', '石虎', '蝸牛', '柴犬', '貓頭鷹', '穿山甲', '企鵝', '松鼠',
  '雲豹', '海豹', '刺蝟', '樹懶', '白鷺', '梅花鹿', '獼猴', '黑熊',
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** 最長的組合是 4 + 3 = 7 個字，不會超過暱稱上限 */
export function randomNickname(except?: string): string {
  for (let i = 0; i < 10; i++) {
    const name = pick(ADJECTIVES) + pick(ANIMALS);
    if (name !== except) return name;
  }
  return pick(ADJECTIVES) + pick(ANIMALS);
}
