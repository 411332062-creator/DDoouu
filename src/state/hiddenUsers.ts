// 隱藏名單：只存在這個瀏覽器裡，認的是身分編號，所以對方改名也有效。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';

export interface HiddenUser {
  userId: string;
  /** 隱藏當下的暱稱，查不到現在的暱稱時顯示這個 */
  nickname: string;
}

const key = (myUserId: string) => `ddoouu.hidden.${myUserId}`;

export function useHiddenUsers(myUserId: string | null) {
  const [list, setList] = useState<HiddenUser[]>([]);

  useEffect(() => {
    setList(myUserId ? readJSON<HiddenUser[]>(key(myUserId), []) : []);
  }, [myUserId]);

  const update = useCallback(
    (next: HiddenUser[]) => {
      setList(next);
      if (myUserId) writeJSON(key(myUserId), next);
    },
    [myUserId],
  );

  const ids = useMemo(() => new Set(list.map((user) => user.userId)), [list]);
  const isHidden = useCallback((userId: string) => ids.has(userId), [ids]);

  const hide = useCallback(
    (userId: string, nickname: string) => {
      if (userId === myUserId || ids.has(userId)) return;
      update([...list, { userId, nickname }]);
    },
    [ids, list, myUserId, update],
  );

  const unhide = useCallback(
    (userId: string) => update(list.filter((user) => user.userId !== userId)),
    [list, update],
  );

  return { list, isHidden, hide, unhide };
}

export type HiddenUsers = ReturnType<typeof useHiddenUsers>;
