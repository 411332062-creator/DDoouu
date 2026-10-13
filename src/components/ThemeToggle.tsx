import type { Theme } from '../state/theme';
import { MoonIcon, SunIcon } from './Icons';

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={theme === 'dark' ? '切換成淺色' : '切換成深色'}
      onClick={onToggle}
    >
      {theme === 'dark' ? <SunIcon size={22} /> : <MoonIcon size={22} />}
    </button>
  );
}
