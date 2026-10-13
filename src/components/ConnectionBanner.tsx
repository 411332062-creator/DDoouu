import type { ConnectionState } from '../chat/types';
import { OfflineIcon } from './Icons';

export function ConnectionBanner({ connection }: { connection: ConnectionState }) {
  if (connection === 'online') return null;
  return (
    <div className="banner banner--warn" role="status">
      <OfflineIcon size={18} />
      <span>連線中斷，正在重新連線…</span>
    </div>
  );
}
