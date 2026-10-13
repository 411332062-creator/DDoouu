import { useState, type FormEvent } from 'react';
import { NICKNAME_MAX, checkNickname, cleanNickname, limitChars, nicknameProblemText } from '../chat/rules';
import type { ChatFailure } from '../state/chatStore';
import { Overlay } from './Overlay';

interface Props {
  current: string;
  offline: boolean;
  onRename: (nickname: string) => Promise<ChatFailure | null>;
  onClose: () => void;
}

export function RenameDialog({ current, offline, onRename, onClose }: Props) {
  const [value, setValue] = useState(current);
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const problem = checkNickname(value);
  const error = problem ? nicknameProblemText(problem) : serverError;
  const unchanged = cleanNickname(value) === current;
  const canSave = !problem && !unchanged && !offline && !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const failure = await onRename(value);
    setSaving(false);
    if (failure === null) {
      onClose();
    } else if (failure.code === 'nickname_taken') {
      setServerError('這個名字有人用了');
    } else if (failure.code === 'nickname_invalid' && failure.reason) {
      setServerError(nicknameProblemText(failure.reason));
    } else {
      setServerError('連線有問題，請再試一次');
    }
  };

  return (
    <Overlay label="修改暱稱" variant="dialog" onClose={onClose}>
      <form className="rename" onSubmit={(event) => void submit(event)}>
        <h2>修改暱稱</h2>
        <label htmlFor="rename-input">新的暱稱（最多 {NICKNAME_MAX} 個字）</label>
        <input
          id="rename-input"
          className={error ? 'text-field text-field--error' : 'text-field'}
          type="text"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(event) => {
            const composing = (event.nativeEvent as InputEvent).isComposing;
            setValue(composing ? event.target.value : limitChars(event.target.value, NICKNAME_MAX));
            setServerError('');
          }}
          onCompositionEnd={(event) => setValue(limitChars(event.currentTarget.value, NICKNAME_MAX))}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        {offline && <p className="field-error">連線中斷，暫時不能改名</p>}
        <p className="rename__hint">改名後，之前發過的訊息仍會顯示舊暱稱。</p>
        <div className="rename__actions">
          <button type="button" className="btn btn--outline" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSave}>
            確定
          </button>
        </div>
      </form>
    </Overlay>
  );
}
