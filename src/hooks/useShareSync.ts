import { useEffect, useRef, useCallback } from 'react';
import { fetchShare, updateShare, type ShareCreatePayload } from '../api/shareApi';

const POLL_MS = 4000;

export function useShareSync(
  shareId: string | null,
  adminToken: string | null,
  getPayload: () => ShareCreatePayload,
  onRemoteStaffUpdate: (staff: ShareCreatePayload['staff']) => void,
  enabled: boolean,
) {
  const payloadRef = useRef(getPayload);
  payloadRef.current = getPayload;
  const lastPushRef = useRef(0);

  const pushToServer = useCallback(async () => {
    if (!shareId || !adminToken) return;
    try {
      await updateShare(shareId, adminToken, payloadRef.current());
      lastPushRef.current = Date.now();
    } catch (e) {
      console.error('Sync push failed:', e);
    }
  }, [shareId, adminToken]);

  useEffect(() => {
    if (!enabled || !shareId) return;

    const poll = async () => {
      if (Date.now() - lastPushRef.current < POLL_MS - 500) return;
      try {
        const remote = await fetchShare(shareId);
        onRemoteStaffUpdate(remote.staff);
      } catch (e) {
        console.error('Sync poll failed:', e);
      }
    };

    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [shareId, enabled, onRemoteStaffUpdate]);

  return { pushToServer };
}
