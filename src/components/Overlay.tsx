import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  label: string;
  /** sheet：從底部滑出；dialog：浮在畫面上半部 */
  variant: 'sheet' | 'dialog';
  onClose: () => void;
  children: ReactNode;
}

/** 浮動視窗的共用外殼：半透明遮罩、點外面關閉、按 Esc 關閉 */
export function Overlay({ label, variant, onClose, children }: Props) {
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className={`overlay overlay--${variant}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section ref={box} className={`overlay__box overlay__box--${variant}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </section>
    </div>
  );
}
