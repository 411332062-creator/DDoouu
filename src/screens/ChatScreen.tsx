import { useEffect, useMemo, useState } from 'react';
import type { ChatStore } from '../state/chatStore';
import type { HiddenUsers } from '../state/hiddenUsers';
import type { Theme } from '../state/theme';
import { Composer } from '../components/Composer';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { MessageList } from '../components/MessageList';
import { OnlinePanel } from '../components/OnlinePanel';
import { RenameDialog } from '../components/RenameDialog';
import { TopBar } from '../components/TopBar';
import { UserMenu } from '../components/UserMenu';

const TOAST_MS = 6000;

interface Props {
  chat: ChatStore;
  hidden: HiddenUsers;
  theme: Theme;
  onToggleTheme: () => void;
}

interface Person {
  userId: string;
  nickname: string;
}

export function ChatScreen({ chat, hidden, theme, onToggleTheme }: Props) {
  const { state } = chat;
  const me = state.me!;
  const [panelOpen, setPanelOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Person | null>(null);
  const [justHidden, setJustHidden] = useState<Person | null>(null);

  const visibleMessages = useMemo(
    () => state.messages.filter((message) => !hidden.isHidden(message.userId)),
    [state.messages, hidden.isHidden],
  );

  const onlineIds = useMemo(
    () => (state.onlineIds.includes(me.userId) ? state.onlineIds : [me.userId, ...state.onlineIds]),
    [state.onlineIds, me.userId],
  );
  const onlineCount = onlineIds.filter((id) => id === me.userId || state.profiles[id]).length;

  // 「已隱藏」提示幾秒後自己消失
  useEffect(() => {
    if (!justHidden) return;
    const timer = window.setTimeout(() => setJustHidden(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [justHidden]);

  const openPanel = () => {
    // 被隱藏的人可能不在線上，要另外查他們現在的暱稱
    void chat.ensureProfiles(hidden.list.map((user) => user.userId));
    setPanelOpen(true);
  };

  const openMenu = (userId: string, nickname: string) => {
    if (userId === me.userId) return;
    setMenuFor({ userId, nickname });
  };

  return (
    <div className="chat">
      <TopBar
        onlineCount={onlineCount}
        nickname={me.nickname}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onOpenOnline={openPanel}
        onOpenRename={() => setRenameOpen(true)}
      />
      <ConnectionBanner connection={state.connection} />

      <MessageList
        messages={visibleMessages}
        myUserId={me.userId}
        hasOlder={state.hasOlder}
        loadingOlder={state.loadingOlder}
        gapBeforeId={state.gapBeforeId}
        now={chat.now()}
        onLoadOlder={() => void chat.loadOlder()}
        onNameClick={openMenu}
      />

      {justHidden && (
        <div className="toast" role="status">
          <span>已隱藏 {justHidden.nickname}</span>
          <button
            type="button"
            onClick={() => {
              hidden.unhide(justHidden.userId);
              setJustHidden(null);
            }}
          >
            復原
          </button>
        </div>
      )}

      <Composer offline={state.connection !== 'online'} rateLockedUntil={state.rateLockedUntil} onSend={chat.send} />

      {panelOpen && (
        <OnlinePanel
          myUserId={me.userId}
          onlineIds={onlineIds}
          profiles={{ ...state.profiles, [me.userId]: me.nickname }}
          hidden={hidden.list}
          isHidden={hidden.isHidden}
          onPick={openMenu}
          onUnhide={hidden.unhide}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {menuFor && (
        <UserMenu
          nickname={state.profiles[menuFor.userId] ?? menuFor.nickname}
          hidden={hidden.isHidden(menuFor.userId)}
          onHide={() => {
            const nickname = state.profiles[menuFor.userId] ?? menuFor.nickname;
            hidden.hide(menuFor.userId, nickname);
            setJustHidden({ userId: menuFor.userId, nickname });
            setMenuFor(null);
          }}
          onUnhide={() => {
            hidden.unhide(menuFor.userId);
            setMenuFor(null);
          }}
          onClose={() => setMenuFor(null)}
        />
      )}

      {renameOpen && (
        <RenameDialog
          current={me.nickname}
          offline={state.connection !== 'online'}
          onRename={chat.rename}
          onClose={() => setRenameOpen(false)}
        />
      )}
    </div>
  );
}
