import type { HiddenUser } from '../state/hiddenUsers';
import { CloseIcon } from './Icons';
import { Overlay } from './Overlay';

interface Props {
  myUserId: string;
  onlineIds: string[];
  profiles: Record<string, string>;
  hidden: HiddenUser[];
  isHidden: (userId: string) => boolean;
  onPick: (userId: string, nickname: string) => void;
  onUnhide: (userId: string) => void;
  onClose: () => void;
}

export function OnlinePanel({ myUserId, onlineIds, profiles, hidden, isHidden, onPick, onUnhide, onClose }: Props) {
  const others = onlineIds
    .filter((id) => id !== myUserId && profiles[id])
    .sort((a, b) => profiles[a].localeCompare(profiles[b], 'zh-Hant'));

  return (
    <Overlay label="線上名單" variant="sheet" onClose={onClose}>
      <div className="panel__head">
        <h2>在線上（{others.length + 1}）</h2>
        <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}>
          <CloseIcon size={22} />
        </button>
      </div>

      <ul className="panel__list">
        <li className="panel__me">
          <span>{profiles[myUserId]}</span>
          <span className="panel__me-tag">（我）</span>
        </li>
        {others.map((id) => (
          <li key={id}>
            <button
              type="button"
              className={isHidden(id) ? 'panel__person panel__person--hidden' : 'panel__person'}
              onClick={() => onPick(id, profiles[id])}
            >
              <span>{profiles[id]}</span>
              {isHidden(id) && <span className="tag">已隱藏</span>}
            </button>
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <>
          <h3 className="panel__subhead">已隱藏的人</h3>
          <ul className="panel__list">
            {hidden.map((user) => (
              <li key={user.userId} className="panel__hidden-row">
                <span>{profiles[user.userId] ?? user.nickname}</span>
                <button type="button" className="pill-btn" onClick={() => onUnhide(user.userId)}>
                  取消隱藏
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Overlay>
  );
}
