import { ArrowDownIcon } from './Icons';

export function NewMessagesButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button type="button" className="new-messages" onClick={onClick}>
      <ArrowDownIcon size={18} />
      <span>有 {count} 則新訊息</span>
    </button>
  );
}
