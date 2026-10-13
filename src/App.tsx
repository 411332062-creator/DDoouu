import { useEffect, useRef } from 'react';
import { createChatBackend } from './chat/createChatService';
import { useChat } from './state/chatStore';
import { useHiddenUsers } from './state/hiddenUsers';
import { useTheme } from './state/theme';
import { ChatScreen } from './screens/ChatScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

const backend = createChatBackend();

/** 手機鍵盤彈出時，把畫面高度縮成鍵盤上方看得到的範圍，輸入區才不會被擋住 */
function useVisibleHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      document.documentElement.style.setProperty('--app-height', `${viewport.height}px`);
      window.scrollTo(0, 0);
    };
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
}

export default function App() {
  useVisibleHeight();
  const [theme, toggleTheme] = useTheme();
  const isHiddenRef = useRef<(userId: string) => boolean>(() => false);
  const chat = useChat(backend.service, isHiddenRef);
  const hidden = useHiddenUsers(chat.state.me?.userId ?? null);
  isHiddenRef.current = hidden.isHidden;

  const DevTools = backend.DevTools;

  return (
    <div className="app">
      {backend.demo && <div className="demo-banner">示範模式：訊息只存在你這台裝置上</div>}
      {chat.state.phase === 'chat' && chat.state.me ? (
        <ChatScreen chat={chat} hidden={hidden} theme={theme} onToggleTheme={toggleTheme} />
      ) : (
        <WelcomeScreen
          loading={chat.state.phase === 'loading'}
          identity={chat.state.identity}
          failed={chat.state.identifyFailed}
          theme={theme}
          onToggleTheme={toggleTheme}
          onRetry={() => void chat.identify()}
          onEnter={chat.enter}
        />
      )}
      {DevTools && <DevTools />}
    </div>
  );
}
