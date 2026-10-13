import { useEffect, useState, type FormEvent } from 'react';
import type { IdentityStatus } from '../chat/types';
import { NICKNAME_MAX, checkNickname, cleanNickname, countChars, limitChars, nicknameProblemText } from '../chat/rules';
import { APP_NAME } from '../lib/config';
import { randomNickname } from '../lib/randomNickname';
import type { ChatFailure } from '../state/chatStore';
import type { Theme } from '../state/theme';
import { RerollIcon, SpinnerIcon } from '../components/Icons';
import { ThemeToggle } from '../components/ThemeToggle';

interface Props {
  loading: boolean;
  identity: IdentityStatus | null;
  failed: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onRetry: () => void;
  /** auto：暱稱是系統抽的、使用者沒改過 */
  onEnter: (nickname: string, auto: boolean) => Promise<ChatFailure | null>;
}

export function WelcomeScreen({ loading, identity, failed, theme, onToggleTheme, onRetry, onEnter }: Props) {
  const [nickname, setNickname] = useState('');
  const [auto, setAuto] = useState(false);
  const [serverError, setServerError] = useState('');
  const [entering, setEntering] = useState(false);

  // 查到身分後填入暱稱：回訪者用原本的，其他情況抽一個
  useEffect(() => {
    if (!identity) return;
    if (identity.status === 'returning') {
      setNickname(identity.nickname);
      setAuto(false);
    } else {
      setNickname(randomNickname());
      setAuto(true);
    }
  }, [identity]);

  const blocked = loading || failed || !identity;
  const problem = blocked ? null : checkNickname(nickname);
  const error = problem ? nicknameProblemText(problem) : serverError;
  const canEnter = !blocked && !problem && !entering;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEnter) return;
    setEntering(true);
    const failure = await onEnter(nickname, auto);
    if (failure === null) return; // 成功後這個畫面會被換掉
    setEntering(false);
    if (failure.code === 'nickname_taken') setServerError('這個名字有人用了');
    else if (failure.code === 'nickname_invalid' && failure.reason) setServerError(nicknameProblemText(failure.reason));
    else setServerError('連線有問題，請再試一次');
  };

  return (
    <div className="welcome">
      <div className="welcome__top">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <form className="welcome__body" onSubmit={(event) => void submit(event)}>
        <div className="welcome__intro">
          <div className="welcome__mark" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M7 10h.01M12 10h.01M17 10h.01" />
            </svg>
          </div>
          <h1>{APP_NAME}</h1>

          {loading && (
            <p className="welcome__loading" role="status">
              <SpinnerIcon size={20} />
              <span>正在確認你的身分…</span>
            </p>
          )}
          {!loading && failed && (
            <div className="notice notice--action" role="alert">
              <span>連線有問題，請再試一次</span>
              <button type="button" className="pill-btn pill-btn--warn" onClick={onRetry}>
                重試
              </button>
            </div>
          )}
          {!loading && !failed && identity?.status === 'new' && (
            <p className="welcome__text">歡迎！這是幫你抽的暱稱，可以直接改成你喜歡的。</p>
          )}
          {!loading && !failed && identity?.status === 'returning' && (
            <p className="welcome__text">歡迎回來，{identity.nickname}</p>
          )}
          {!loading && !failed && identity?.status === 'nickname_lost' && (
            <p className="notice">
              你原本的暱稱「{identity.nickname}」已經被別人使用了。幫你重新抽了一個，可以直接修改。
            </p>
          )}
        </div>

        <div className="welcome__field">
          <label htmlFor="nickname-input">你的暱稱</label>
          <input
            id="nickname-input"
            className={error ? 'text-field text-field--large text-field--error' : 'text-field text-field--large'}
            type="text"
            autoComplete="off"
            value={nickname}
            disabled={blocked || entering}
            onChange={(event) => {
              const composing = (event.nativeEvent as InputEvent).isComposing;
              setNickname(composing ? event.target.value : limitChars(event.target.value, NICKNAME_MAX));
              setAuto(false);
              setServerError('');
            }}
            onCompositionEnd={(event) => setNickname(limitChars(event.currentTarget.value, NICKNAME_MAX))}
          />
          <div className="welcome__under">
            <div className="welcome__status">
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <p className="welcome__count">
                {countChars(cleanNickname(nickname))} / {NICKNAME_MAX} 個字
              </p>
            </div>
            <button
              type="button"
              className="text-btn"
              disabled={blocked || entering}
              onClick={() => {
                setNickname(randomNickname(nickname));
                setAuto(true);
                setServerError('');
              }}
            >
              <RerollIcon size={18} />
              <span>重新抽一個</span>
            </button>
          </div>
        </div>

        <div className="welcome__enter">
          <button type="submit" className="btn btn--primary btn--large btn--busy" disabled={!canEnter}>
            {entering ? (
              <>
                <SpinnerIcon size={20} />
                <span>進入中…</span>
              </>
            ) : (
              '進入聊天室'
            )}
          </button>
          <p className="welcome__note">不用註冊。所有人都看得到這裡的訊息，請不要輸入個人資料。</p>
        </div>
      </form>
    </div>
  );
}
