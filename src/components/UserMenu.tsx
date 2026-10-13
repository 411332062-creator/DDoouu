import { EyeIcon, EyeOffIcon } from './Icons';
import { Overlay } from './Overlay';

interface Props {
  nickname: string;
  hidden: boolean;
  onHide: () => void;
  onUnhide: () => void;
  onClose: () => void;
}

export function UserMenu({ nickname, hidden, onHide, onUnhide, onClose }: Props) {
  return (
    <Overlay label="使用者選單" variant="sheet" onClose={onClose}>
      <div className="menu">
        <div className="menu__name">{nickname}</div>
        {hidden ? (
          <>
            <p className="menu__hint">你已經隱藏這個人。取消後，他最近 24 小時的訊息會回到你的畫面上。</p>
            <button type="button" className="menu__action" onClick={onUnhide}>
              <EyeIcon size={20} />
              <span>取消隱藏</span>
            </button>
          </>
        ) : (
          <>
            <p className="menu__hint">隱藏後，他的訊息只會從你的畫面消失，別人還是看得到。</p>
            <button type="button" className="menu__action" onClick={onHide}>
              <EyeOffIcon size={20} />
              <span>隱藏這個人</span>
            </button>
          </>
        )}
        <button type="button" className="menu__close" onClick={onClose}>
          關閉
        </button>
      </div>
    </Overlay>
  );
}
