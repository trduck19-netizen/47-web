/**
 * Cross-tab Session, Wallet & Theme Synchronizer
 * Đồng bộ tức thì giữa Tab Sàn Mua Sắm (/) và Tab Cổng Người Bán (/seller)
 * trên cùng origin qua BroadcastChannel + fallback window storage event.
 */

export type CrossTabEventType = 'AUTH_UPDATED' | 'AUTH_LOGOUT' | 'WALLET_UPDATED' | 'THEME_UPDATED' | 'BRAND_UPDATED';

export interface CrossTabEventPayload {
  type: CrossTabEventType;
  balance?: number;
  theme?: 'light' | 'dark';
  brand?: Record<string, any>;
  ts: number;
  senderId: string;
}

const CHANNEL_NAME = 'wcg_portal_sync_v1';
const STORAGE_PING_KEY = 'wcg_portal_sync_ping_v1';
const TAB_SENDER_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

let sharedChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!sharedChannel) {
    try {
      sharedChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return sharedChannel;
}

export function broadcastCrossTabEvent(
  type: CrossTabEventType,
  extra?: { balance?: number; theme?: 'light' | 'dark'; brand?: Record<string, any> }
): void {
  if (typeof window === 'undefined') return;
  const payload: CrossTabEventPayload = {
    type,
    ...(extra || {}),
    ts: Date.now(),
    senderId: TAB_SENDER_ID,
  };

  try {
    const ch = getChannel();
    if (ch) ch.postMessage(payload);
  } catch {}

  try {
    localStorage.setItem(STORAGE_PING_KEY, JSON.stringify(payload));
  } catch {}
}

export function subscribeCrossTabEvents(
  handler: (event: CrossTabEventPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const lastHandledTs = { value: 0 };

  const dispatchIfFresh = (payload: CrossTabEventPayload | null) => {
    if (!payload || !payload.type || payload.senderId === TAB_SENDER_ID) return;
    if (payload.ts && payload.ts <= lastHandledTs.value) return;
    lastHandledTs.value = payload.ts || Date.now();
    handler(payload);
  };

  const ch = getChannel();
  const onChannelMsg = (ev: MessageEvent) => {
    dispatchIfFresh(ev?.data as CrossTabEventPayload);
  };
  if (ch) {
    ch.addEventListener('message', onChannelMsg);
  }

  const onStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_PING_KEY && ev.newValue) {
      try {
        dispatchIfFresh(JSON.parse(ev.newValue));
      } catch {}
      return;
    }
    if (ev.key === 'pine_auth_token') {
      if (!ev.newValue) {
        handler({ type: 'AUTH_LOGOUT', ts: Date.now(), senderId: 'storage' });
      } else {
        handler({ type: 'AUTH_UPDATED', ts: Date.now(), senderId: 'storage' });
      }
      return;
    }
    if (ev.key === 'wcg_shopee_theme' && (ev.newValue === 'light' || ev.newValue === 'dark')) {
      handler({ type: 'THEME_UPDATED', theme: ev.newValue, ts: Date.now(), senderId: 'storage' });
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    if (ch) ch.removeEventListener('message', onChannelMsg);
    window.removeEventListener('storage', onStorage);
  };
}
