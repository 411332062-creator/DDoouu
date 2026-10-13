// 淺色深色：第一次跟隨系統設定（index.html 裡先套用），按過之後記在瀏覽器裡。

import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'ddoouu.theme';

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // 記不住就算了，這次照樣切換
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
