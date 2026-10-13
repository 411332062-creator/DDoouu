import { APP_NAME } from '../lib/config';
import type { Theme } from '../state/theme';
import { PencilIcon, PeopleIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

interface Props {
  onlineCount: number;
  nickname: string;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenOnline: () => void;
  onOpenRename: () => void;
}

export function TopBar({ onlineCount, nickname, theme, onToggleTheme, onOpenOnline, onOpenRename }: Props) {
  return (
    <header className="topbar">
      <div className="topbar__row">
        <h1 className="topbar__title">{APP_NAME}</h1>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="topbar__row">
        <button type="button" className="topbar__online" onClick={onOpenOnline}>
          <PeopleIcon size={18} />
          <span>{onlineCount} 人在線</span>
        </button>
        <button
          type="button"
          className="topbar__me"
          aria-label={`我的暱稱：${nickname}，點一下改名`}
          onClick={onOpenRename}
        >
          <span className="topbar__nickname">{nickname}</span>
          <PencilIcon size={16} />
        </button>
      </div>
    </header>
  );
}
