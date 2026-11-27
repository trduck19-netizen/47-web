import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gift,
  ShoppingBag,
  Wallet,
  Zap,
  X,
  ChevronRight,
  Sparkles,
  Wrench,
  Flame,
  BellOff,
  PackagePlus,
} from 'lucide-react';
import type { MarketingNotification, ToastPosition } from '../types/marketing';
import { marketingService } from '../services/marketingService';
import { dataService } from '../services/dataService';
import { contentTranslationService } from '../services/contentTranslationService';
import { useLanguage } from '../context/LanguageContext';

const MARKETING_SNOOZE_KEY = 'pine_marketing_toast_snooze_until';

interface MarketingNotificationToastProps {
  onSelectGameSlug?: (slug: string) => void;
  onSelectProduct?: (productId: string) => void;
  onSelectUtility?: (utilityId: string) => void;
  onSelectGiveaway?: (giveawayId: string) => void;
  onOpenWallet?: () => void;
  onExploreClick?: () => void;
}

export const MarketingNotificationToast: React.FC<MarketingNotificationToastProps> = ({
  onSelectGameSlug,
  onSelectProduct,
  onSelectUtility,
  onSelectGiveaway,
  onOpenWallet,
  onExploreClick,
}) => {
  const { t, language } = useLanguage();
  const [notification, setNotification] = useState<MarketingNotification | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
    const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);

  useEffect(() => {
    const handleMobileSearchToggle = (e: any) => {
      setIsMobileSearchActive(Boolean(e?.detail?.isOpen));
    };
    window.addEventListener('pine_mobile_search_toggled', handleMobileSearchToggle);
    return () => window.removeEventListener('pine_mobile_search_toggled', handleMobileSearchToggle);
  }, []);

  const [toastPosition, setToastPosition] = useState<ToastPosition>(() => {
    return marketingService.getConfig().toastPosition || 'bottom-left';
  });

  useEffect(() => {
    const handleConfigChange = () => {
      setToastPosition(marketingService.getConfig().toastPosition || 'bottom-left');
    };
    window.addEventListener('pine_marketing_config_updated', handleConfigChange);
    return () => window.removeEventListener('pine_marketing_config_updated', handleConfigChange);
  }, []);

  const timerRef = useRef<any>(null);
  const hideTimerRef = useRef<any>(null);
  const dismissTimerRef = useRef<any>(null);
  const initialWelcomeTimerRef = useRef<any>(null);
  const isTabHiddenRef = useRef(false);
  const isHoveredRef = useRef(false);
  const lastToastDismissedTimeRef = useRef<number>(0);
  const currentNotificationIdRef = useRef<string | null>(null);
  const lastDisplayedSlotRef = useRef<number>(-1);
  isHoveredRef.current = isHovered;

  // Check if user has snoozed notifications within the last 1 hour
  const isSnoozed = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const saved = localStorage.getItem(MARKETING_SNOOZE_KEY);
      if (saved) {
        const until = parseInt(saved, 10);
        if (!isNaN(until)) {
          if (until > Date.now()) {
            return true;
          } else {
            // Tự động xóa cờ snooze đã hết hạn
            localStorage.removeItem(MARKETING_SNOOZE_KEY);
          }
        }
      }
    } catch {}
    return false;
  }, []);

  // Dismiss current notification smoothly
  const dismissNotification = useCallback(() => {
    setIsExiting(true);
    lastToastDismissedTimeRef.current = Date.now();
    const dismissingId = currentNotificationIdRef.current;
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      // Chỉ ẩn khi ID thông báo đang đóng vẫn là ID hiện tại (tránh ghi đè khi thông báo thật mới vừa hiển thị)
      if (currentNotificationIdRef.current === dismissingId) {
        setIsVisible(false);
        setIsExiting(false);
        setNotification(null);
        currentNotificationIdRef.current = null;
      }
      // Sau khi thông báo hiện tại đóng, chỉ duy trì vòng lặp nếu marketing FOMO vẫn đang BẬT
      const activeCfg = marketingService.getConfig();
      if (activeCfg.isEnabled) {
        const nextDelay = marketingService.hasPendingRealEvent() ? 1200 : 1500;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => scheduleRef.current(), nextDelay);
      }
    }, 300);
  }, []);

  // Mute notifications for 1 hour (3600 seconds)
  const snoozeForOneHour = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      const until = Date.now() + 60 * 60 * 1000;
      localStorage.setItem(MARKETING_SNOOZE_KEY, String(until));
    } catch {}
    dismissNotification();
  }, [dismissNotification]);

  // Display a notification
  const displayNotification = useCallback((notif: MarketingNotification, customDurationMs?: number) => {
    if (isSnoozed()) return;
    const isTest = Boolean(notif.id && notif.id.startsWith('test_'));
    if (!isTest && !marketingService.isTypeEnabled(notif.type, notif.itemType)) return;

    // Yêu cầu 2: Bỏ qua tuyệt đối nếu ID sự kiện này đã từng hiển thị trên trình duyệt này
    if (notif.id && marketingService.isNotificationProcessed(notif.id)) {
      return;
    }

    // Yêu cầu 1: Chống spam sao chép 20 giây tối đa 1 thông báo cho mỗi người dùng (khóa = tên đã che + loại thao tác)
    if (notif.type === 'COPY_CODE') {
      const userKey = notif.userName || 'Khách';
      if (!marketingService.canDisplayActionNotification(userKey, 'COPY_CODE', 20000)) {
        return; // Chặn hiển thị thông báo do đang trong cooldown 20s
      }
      marketingService.recordActionNotificationDisplayed(userKey, 'COPY_CODE');
    }

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    // Safety guard: ensure not a deleted or unlisted product
    let deletedStoreSet = new Set<string>();
    let deletedUtilSet = new Set<string>();
    let deletedGwSet = new Set<string>();
    try {
      if (typeof window !== 'undefined') {
        const rawDelSp = localStorage.getItem('pine_deleted_store_products');
        if (rawDelSp) deletedStoreSet = new Set(JSON.parse(rawDelSp));
        const rawDelUt = localStorage.getItem('pine_deleted_utilities');
        if (rawDelUt) deletedUtilSet = new Set(JSON.parse(rawDelUt));
        const rawDelGw = localStorage.getItem('pine_deleted_giveaways');
        if (rawDelGw) deletedGwSet = new Set(JSON.parse(rawDelGw));
      }
    } catch {}

    if (notif.type === 'BUY_PRODUCT' && notif.productId) {
      if (deletedStoreSet.has(notif.productId) || deletedUtilSet.has(notif.productId)) {
        return;
      }
    }
    if (notif.type === 'CLAIM_GIVEAWAY' && notif.giveawayId) {
      if (deletedGwSet.has(notif.giveawayId)) {
        return;
      }
    }
    if (notif.type === 'RESTOCK_PRODUCT' && notif.productId) {
      if (deletedStoreSet.has(notif.productId) || deletedUtilSet.has(notif.productId) || deletedGwSet.has(notif.productId)) {
        return;
      }
      // QUY TẮC BẮT BUỘC TỪ NGƯỜI DÙNG: Chỉ thông báo những mục còn hàng đang bán trên web
      const realStock = marketingService.getRealStockFor(notif.productId);
      if (realStock <= 0) {
        return;
      }
      const displayStock = marketingService.getDisplayStock(notif.productId, realStock);
      if (displayStock <= 0) {
        return;
      }
    }

    const finalNotif = marketingService.sanitizeNotificationMasking(notif);

    setNotification(finalNotif);
    currentNotificationIdRef.current = finalNotif.id || null;
    setIsVisible(true);
    setIsExiting(false);

    // Mark as processed in marketingService so it is NEVER duplicated or replayed
    if (finalNotif.id) {
      const { currentSlotIndex } = marketingService.getVnDayAnchor();
      marketingService.markNotificationProcessed(finalNotif.id, currentSlotIndex);
      marketingService.removeSlotEvent(finalNotif.id);
    }

    // Luôn ưu tiên tăng giảm số lượng của web theo thông báo nổ (bảo toàn 1 - 1 tuyệt đối cho cả thật và ảo):
    marketingService.recordToastFiredTime();
    if (notif.productId) {
      marketingService.notifyStockChanged(notif.productId, marketingService.getDisplayStock(notif.productId));
      marketingService.notifySoldCountChanged(notif.productId, marketingService.getSoldDisplay({ id: notif.productId }));
    }
    if (notif.giveawayId) {
      marketingService.notifyStockChanged(notif.giveawayId, marketingService.getDisplayStock(notif.giveawayId));
      marketingService.notifySoldCountChanged(notif.giveawayId, marketingService.getClaimedDisplay({ id: notif.giveawayId }));
    }
    if (notif.type === 'COPY_CODE') {
      const isSelf = Boolean(
        (notif as any).isSelfClick ||
        (notif as any).localOrigin ||
        (notif.id && marketingService.isSelfClickToast(notif.id))
      );
      if (!isSelf) {
        marketingService.incrementLiveCounter(1, notif.id);
      } else {
        marketingService.broadcastCurrentCount();
      }
    }

    const config = marketingService.getConfig();
    const defaultDuration = Math.max(3, config.displayDuration || 5) * 1000;
    const duration = customDurationMs !== undefined ? customDurationMs : defaultDuration;

    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveredRef.current) {
        dismissNotification();
      }
    }, duration);
  }, [dismissNotification, isSnoozed]);

  // Helper to fetch current datasets
  const getDatasets = useCallback(() => {
    const games = typeof dataService.getGames === 'function' ? dataService.getGames() : [];
    const storeProducts = typeof dataService.getStoreProducts === 'function' ? dataService.getStoreProducts() : [];
    const utilityProducts = typeof dataService.getUtilityProducts === 'function' ? dataService.getUtilityProducts() : [];
    const giveaways = typeof dataService.getGiveaways === 'function' ? dataService.getGiveaways().filter((g) => g && g.is_active !== false) : [];
    let inventory: any[] = [];
    try {
      const invRaw = localStorage.getItem('pine_admin_inventory_v4');
      if (invRaw) inventory = JSON.parse(invRaw);
    } catch {}
    return { games, storeProducts, utilityProducts, giveaways, inventory };
  }, []);

  // Globally Synchronized Server Ledger Scheduler (Slot Clock Synchronized Engine)
  const scheduleDeterministicSlot = useCallback(() => {
    try {
      const config = marketingService.getConfig();
      if (!config.isEnabled) return;
      if (isTabHiddenRef.current) return;
      if (isSnoozed()) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => scheduleRef.current(), 10000);
        return;
      }

      // Thời lượng hiển thị phải nhỏ hơn nhịp khe 10s: tối đa 4 giây để chống chồng chéo
      const maxDisplayDurationMs = 4000;
      const displayDurationMs = Math.min(maxDisplayDurationMs, Math.max(2500, Number(config.displayDuration) * 1000 || 4000));

      // =========================================================================
      // 1. LOCAL REAL USER EVENTS (Local click feedback - Top Priority, vượt khe)
      // =========================================================================
      const calibratedNow = marketingService.getCalibratedNow();
      const { dayStartMs, currentSlotIndex } = marketingService.getVnDayAnchor(calibratedNow);

      if (marketingService.hasPendingRealEvent()) {
        const nextRealEvent = marketingService.peekRealEvent();
        if (nextRealEvent) {
          marketingService.popRealEvent();
          // Kiểm tra chống lặp: Không hiển thị nếu ID sự kiện thật đã từng hiển thị
          if (nextRealEvent.id && marketingService.isNotificationProcessed(nextRealEvent.id)) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => scheduleRef.current(), 100);
            return;
          }
          // Kiểm tra chống spam sao chép 20s theo người dùng
          if (nextRealEvent.type === 'COPY_CODE' && !marketingService.canDisplayActionNotification(nextRealEvent.userName || '', 'COPY_CODE', 20000)) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => scheduleRef.current(), 100);
            return;
          }

          // Yêu cầu 2: Đánh dấu khe hiện tại đã được phục vụ bởi sự kiện thật & loại khỏi bảng khe để không hiện lần 2 qua đường khe
          lastDisplayedSlotRef.current = currentSlotIndex;
          if (nextRealEvent.id) {
            marketingService.removeSlotEvent(nextRealEvent.id);
          }

          displayNotification(nextRealEvent, displayDurationMs);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => scheduleRef.current(), displayDurationMs + 1000);
          return;
        }
      }

      // =========================================================================
      // 2. AUTHORITATIVE SERVER LEDGER EVENTS (Slot Clock Synchronized Engine)
      // Mọi trình duyệt hiển thị sự kiện của KHE HIỆN TẠI theo đồng hồ đã hiệu chuẩn.
      // Cùng một khe thì cùng một thông báo trên mọi máy. Không phát lại ngẫu nhiên.
      // Trình duyệt mới mở và tab ẩn quay lại đều bắt đầu từ khe hiện tại.
      // =========================================================================
      const slotDurationMs = 10000; // Chu kỳ khe 10s cố định toàn hệ thống
      const slotStartMs = dayStartMs + currentSlotIndex * slotDurationMs;
      const slotEndMs = slotStartMs + slotDurationMs;
      const slotFireTimeMs = slotStartMs + 1500; // Giây 1.5 của khe
      const slotHideTimeMs = slotFireTimeMs + displayDurationMs; // Giây 5.5 (thời lượng 4s)

      // Trường hợp A: Khe này ĐÃ ĐƯỢC HIỂN THỊ trên trình duyệt này
      if (lastDisplayedSlotRef.current === currentSlotIndex) {
        // Đã hiển thị trong khe này -> Chờ tới giây 1.5 của khe kế tiếp
        const msToNextSlot = Math.max(300, slotEndMs - calibratedNow + 1500);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => scheduleRef.current(), msToNextSlot);
        return;
      }

      // Trường hợp B: Khe này CHƯA HIỂN THỊ trên trình duyệt này
      // B.1: Chưa đến giờ nổ của khe hiện tại
      if (calibratedNow < slotFireTimeMs) {
        const msWait = Math.max(50, slotFireTimeMs - calibratedNow);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => scheduleRef.current(), msWait);
        return;
      }

      // B.2: Đang nằm trong cửa sổ hiển thị hợp lệ của khe hiện tại (từ 1.5s đến 8.0s của khe 10s)
      if (calibratedNow >= slotFireTimeMs && calibratedNow < slotEndMs - 2000) {
        let currentSlotEvt = marketingService.getCurrentSlotEvent(currentSlotIndex);
        // Fallback: Nếu chưa khớp slotIndex, lấy sự kiện kế tiếp trong hàng đợi sổ máy chủ để đảm bảo không bị rỗng khe
        if (!currentSlotEvt) {
          currentSlotEvt = marketingService.getNextLedgerEvent() || marketingService.getLatestLedgerEvent();
        }

        if (currentSlotEvt) {
          const datasets = getDatasets();
          let isValid = true;

          // Yêu cầu 2: Bỏ qua tuyệt đối nếu sự kiện này đã hiển thị trên trình duyệt này
          if (currentSlotEvt.id && marketingService.isNotificationProcessed(currentSlotEvt.id)) {
            isValid = false;
          }

          // Yêu cầu 1: Bỏ qua nếu là sự kiện sao chép đang trong cooldown 20s của người dùng đó
          if (currentSlotEvt.type === 'COPY_CODE' && !marketingService.canDisplayActionNotification(currentSlotEvt.userName || '', 'COPY_CODE', 20000)) {
            isValid = false;
          }

          let deletedStoreSet = new Set<string>();
          let deletedUtilSet = new Set<string>();
          let deletedGwSet = new Set<string>();
          try {
            if (typeof window !== 'undefined') {
              const rawDelSp = localStorage.getItem('pine_deleted_store_products');
              if (rawDelSp) deletedStoreSet = new Set(JSON.parse(rawDelSp));
              const rawDelUt = localStorage.getItem('pine_deleted_utilities');
              if (rawDelUt) deletedUtilSet = new Set(JSON.parse(rawDelUt));
              const rawDelGw = localStorage.getItem('pine_deleted_giveaways');
              if (rawDelGw) deletedGwSet = new Set(JSON.parse(rawDelGw));
            }
          } catch {}

          if (currentSlotEvt.type === 'BUY_PRODUCT' && currentSlotEvt.productId) {
            if (deletedStoreSet.has(currentSlotEvt.productId) || deletedUtilSet.has(currentSlotEvt.productId)) {
              isValid = false;
            } else {
              const storeProd = (datasets.storeProducts || []).find((p) => p && p.id === currentSlotEvt.productId);
              const utilProd = (datasets.utilityProducts || []).find((u) => u && u.id === currentSlotEvt.productId);
              const prod = storeProd || utilProd;
              if (prod && prod.is_active === false) isValid = false;
            }
          } else if (currentSlotEvt.type === 'CLAIM_GIVEAWAY' && currentSlotEvt.giveawayId) {
            if (deletedGwSet.has(currentSlotEvt.giveawayId)) {
              isValid = false;
            } else {
              const gw = (datasets.giveaways || []).find((g) => g && g.id === currentSlotEvt.giveawayId);
              if (gw && gw.is_active === false) isValid = false;
            }
          }

          if (isValid && !marketingService.isTypeEnabled(currentSlotEvt.type, currentSlotEvt.itemType)) {
            isValid = false;
          }

          if (isValid) {
            lastDisplayedSlotRef.current = currentSlotIndex;
            // Bù hiển thị ngay trong cửa sổ còn lại của khe (tối thiểu 2s, tối đa 4s)
            const remainingDurationMs = Math.min(displayDurationMs, Math.max(2000, slotEndMs - calibratedNow - 500));
            displayNotification(currentSlotEvt, remainingDurationMs);
            const msToNextSlot = Math.max(1000, slotEndMs - calibratedNow + 1500);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => scheduleRef.current(), msToNextSlot);
            return;
          }
        } else {
          // Chưa có sự kiện cho khe hiện tại từ sổ máy chủ:
          // Thử lại nhanh sau 500ms nếu vẫn còn trong cửa sổ khe để chờ poller tải về bù
          if (calibratedNow < slotEndMs - 2500) {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => scheduleRef.current(), 500);
            return;
          }
        }
      }

      // B.3: Đã thực sự quá cửa sổ hiển thị của khe hiện tại (sau giây 8.0 của khe)
      // Nếu là lần đầu mở web (chưa có thông báo nào hiển thị), lập tức phát sự kiện mới nhất để đảm bảo thông báo đầu tiên <= 20s (thực tế ~3-4s)
      if (lastDisplayedSlotRef.current === -1) {
        const welcomeEvt = marketingService.getLatestLedgerEvent() || marketingService.getCurrentSlotEvent(currentSlotIndex);
        if (welcomeEvt && !marketingService.isNotificationProcessed(welcomeEvt.id || '')) {
          lastDisplayedSlotRef.current = currentSlotIndex;
          displayNotification(welcomeEvt, 3500);
          const msToNextSlot = Math.max(1000, slotEndMs - calibratedNow + 1500);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => scheduleRef.current(), msToNextSlot);
          return;
        }
      }

      // Đánh dấu bỏ qua khe này để TUYỆT ĐỐI KHÔNG PHÁT LẠI (chống trùng theo khe, không replay ngẫu nhiên)
      lastDisplayedSlotRef.current = currentSlotIndex;
      const msToNextSlot = Math.max(500, slotEndMs - calibratedNow + 1500);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => scheduleRef.current(), msToNextSlot);
    } catch (err) {
      console.warn('[MarketingToast] Error scheduling slot event:', err);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => scheduleRef.current(), 5000);
    }
  }, [displayNotification, getDatasets, isSnoozed]);

  // Stable reference for timer loops
  const scheduleRef = useRef<() => void>(() => {});
  scheduleRef.current = scheduleDeterministicSlot;

  // Handle visibility changes (Pause when tab hidden, re-sync to exact clock slot on resume)
  useEffect(() => {
    const handleVisibility = () => {
      isTabHiddenRef.current = document.visibilityState === 'hidden';
      if (isTabHiddenRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        // Immediately sync to the deterministic slot when user returns to tab
        scheduleRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Listen for clear snooze event from Admin or reset triggers
  useEffect(() => {
    const handleClearSnooze = () => {
      try {
        localStorage.removeItem(MARKETING_SNOOZE_KEY);
      } catch {}
      // Immediately kick off schedule when snooze cleared
      scheduleRef.current();
    };
    window.addEventListener('pine_clear_marketing_snooze', handleClearSnooze);
    return () => window.removeEventListener('pine_clear_marketing_snooze', handleClearSnooze);
  }, []);

  // Đồng bộ đa tab: Lắng nghe sự kiện đã hiển thị từ các tab khác trong cùng trình duyệt
  useEffect(() => {
    const handleNotifProcessed = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      if (typeof detail.slotIndex === 'number') {
        lastDisplayedSlotRef.current = detail.slotIndex;
      }
      if (detail.notifId && currentNotificationIdRef.current === detail.notifId) {
        dismissNotification();
      }
    };
    window.addEventListener('pine_notif_processed', handleNotifProcessed);
    return () => window.removeEventListener('pine_notif_processed', handleNotifProcessed);
  }, [dismissNotification]);

  // Subscribe to real actions (local or broadcast)
  useEffect(() => {
    const unsubscribe = marketingService.subscribeNotification((event) => {
      if (event && !isTabHiddenRef.current && !isSnoozed()) {
        if (event.id && marketingService.isNotificationProcessed(event.id)) return;
        if (event.type === 'COPY_CODE' && !marketingService.canDisplayActionNotification(event.userName || '', 'COPY_CODE', 20000)) return;

        const { currentSlotIndex } = marketingService.getVnDayAnchor();
        lastDisplayedSlotRef.current = currentSlotIndex;
        if (event.id) {
          marketingService.removeSlotEvent(event.id);
        }

        const config = marketingService.getConfig();
        const displayDurationMs = Math.min(4000, Math.max(2500, Number(config.displayDuration) * 1000 || 4000));
        displayNotification(event, displayDurationMs);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          scheduleRef.current();
        }, displayDurationMs + 1000);
      }
    });
    return () => unsubscribe();
  }, [displayNotification, isSnoozed]);

  // Listen for ledger events arriving from poller or edge sync
  useEffect(() => {
    const handleNewEvents = () => {
      if (isTabHiddenRef.current || isSnoozed()) return;
      if (!currentNotificationIdRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        // Bù hiển thị ngay lập tức trong cửa sổ khe khi sự kiện sổ máy chủ vừa về
        scheduleRef.current();
      }
    };

    window.addEventListener('pine_new_ledger_events_available', handleNewEvents);
    window.addEventListener('pine_new_real_events_available', handleNewEvents);
    return () => {
      window.removeEventListener('pine_new_ledger_events_available', handleNewEvents);
      window.removeEventListener('pine_new_real_events_available', handleNewEvents);
    };
  }, [isSnoozed]);

  // Initial startup: calibrate with server atomic time, trigger welcome toast from server ledger & kick off schedule
  useEffect(() => {
    const config = marketingService.getConfig();
    if (!config.isEnabled) return;

    let isMounted = true;

    // 1. Initial Welcome Toast: Kích hoạt ngay sau initialDelay từ sự kiện sổ server (đảm bảo <= 20s, mặc định 3s)
    const initDelaySec = Math.max(1, Math.min(10, Number(config.initialDelay) || 3));
    initialWelcomeTimerRef.current = setTimeout(() => {
      if (!isMounted || isTabHiddenRef.current || isSnoozed()) return;
      if (!marketingService.getConfig().isEnabled) return;
      if (!currentNotificationIdRef.current) {
        const welcomeEvt = marketingService.getLatestLedgerEvent() || marketingService.getCurrentSlotEvent(marketingService.getVnDayAnchor().currentSlotIndex);
        if (welcomeEvt && !marketingService.isNotificationProcessed(welcomeEvt.id || '')) {
          const displayDurationMs = Math.min(4000, Math.max(2500, Number(config.displayDuration) * 1000 || 4000));
          displayNotification(welcomeEvt, displayDurationMs);
          const { currentSlotIndex } = marketingService.getVnDayAnchor();
          lastDisplayedSlotRef.current = currentSlotIndex;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => scheduleRef.current(), displayDurationMs + 1000);
          return;
        }
        scheduleRef.current();
      }
    }, initDelaySec * 1000);

    // 2. Calibrate atomic clock and sync stats & events immediately from edge server (/api/realtime-events)
    fetch(`/api/realtime-events?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && typeof data.server_time === 'number') {
          marketingService.calibrateServerTime(data.server_time);
        }
        if (data && data.success) {
          marketingService.syncFromHub(
            data.events,
            data.master_copy_clicks,
            data.real_product_sold_counts,
            data.real_giveaway_claimed_counts,
            data.master_copy_clicks_date,
            data.counters,
            data.peak_product_sold_counts,
            data.peak_giveaway_claimed_counts,
            data.lowest_product_stock,
            data.lowest_giveaway_remaining
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) {
          scheduleRef.current();
        }
      });

    return () => {
      isMounted = false;
      if (initialWelcomeTimerRef.current) clearTimeout(initialWelcomeTimerRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [displayNotification, getDatasets, isSnoozed]);

  // Listen for config updates or manual test triggers
  useEffect(() => {
    const handleConfigUpdate = () => {
      const newConfig = marketingService.getConfig();
      if (!newConfig.isEnabled) {
        if (initialWelcomeTimerRef.current) {
          clearTimeout(initialWelcomeTimerRef.current);
          initialWelcomeTimerRef.current = null;
        }
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (hideTimerRef.current) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        dismissNotification();
      } else {
        if (timerRef.current) clearTimeout(timerRef.current);
        scheduleRef.current();
      }
    };

    const handleTestTrigger = () => {
      const datasets = getDatasets();
      const testNotif = marketingService.generateNextNotification(
        datasets.games,
        datasets.storeProducts,
        datasets.inventory,
        datasets.utilityProducts,
        datasets.giveaways
      );
      if (testNotif) displayNotification(testNotif);
    };

    window.addEventListener('pine_marketing_config_updated', handleConfigUpdate);
    window.addEventListener('storage', handleConfigUpdate);
    window.addEventListener('pine_trigger_marketing_test', handleTestTrigger);

    return () => {
      window.removeEventListener('pine_marketing_config_updated', handleConfigUpdate);
      window.removeEventListener('storage', handleConfigUpdate);
      window.removeEventListener('pine_trigger_marketing_test', handleTestTrigger);
    };
  }, [dismissNotification, displayNotification, getDatasets]);

  // Handle click on the toast
  const handleClickToast = () => {
    if (!notification) return;

    if (notification.type === 'COPY_CODE' && notification.gameSlug) {
      onSelectGameSlug?.(notification.gameSlug);
      dismissNotification();
    } else if (notification.type === 'BUY_PRODUCT' && notification.productId) {
      if (notification.itemType === 'utility') {
        onSelectUtility ? onSelectUtility(notification.productId) : onSelectProduct?.(notification.productId);
      } else {
        onSelectProduct?.(notification.productId);
      }
      dismissNotification();
    } else if (notification.type === 'CLAIM_GIVEAWAY' && notification.giveawayId) {
      if (onSelectGiveaway) {
        onSelectGiveaway(notification.giveawayId);
      } else {
        onExploreClick?.();
      }
      dismissNotification();
    } else if (notification.type === 'DEPOSIT_WALLET') {
      onOpenWallet?.();
      dismissNotification();
    } else if (notification.type === 'RESTOCK_PRODUCT' && notification.productId) {
      if (notification.itemType === 'utility') {
        onSelectUtility ? onSelectUtility(notification.productId) : onSelectProduct?.(notification.productId);
      } else if (notification.itemType === 'giveaway') {
        onSelectGiveaway ? onSelectGiveaway(notification.productId) : onExploreClick?.();
      } else {
        onSelectProduct?.(notification.productId);
      }
      dismissNotification();
    } else if (notification.type === 'STATS_COPY') {
      onExploreClick?.();
      dismissNotification();
    } else {
      onExploreClick?.();
      dismissNotification();
    }
  };

  if (isMobileSearchActive || !notification || !isVisible || !marketingService.getConfig().isEnabled) return null;
  if (typeof document === 'undefined') return null;

  // Icon & Theme per notification type
  const getTypeMeta = () => {
    switch (notification.type) {
      case 'COPY_CODE':
        return {
          icon: Gift,
          badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          hoverBorder: 'hover:border-emerald-500/50',
        };
      case 'BUY_PRODUCT':
        if (notification.itemType === 'utility') {
          return {
            icon: Wrench,
            badgeColor: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
            dotColor: 'bg-teal-400',
            hoverBorder: 'hover:border-teal-500/50',
          };
        }
        return {
          icon: ShoppingBag,
          badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
          dotColor: 'bg-indigo-400',
          hoverBorder: 'hover:border-indigo-500/50',
        };
      case 'RESTOCK_PRODUCT':
        return {
          icon: PackagePlus,
          badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          dotColor: 'bg-emerald-400',
          hoverBorder: 'hover:border-emerald-500/50',
        };
      case 'CLAIM_GIVEAWAY':
        return {
          icon: Flame,
          badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
          dotColor: 'bg-rose-400',
          hoverBorder: 'hover:border-rose-500/50',
        };
      case 'DEPOSIT_WALLET':
        return {
          icon: Wallet,
          badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
          dotColor: 'bg-amber-400',
          hoverBorder: 'hover:border-amber-500/50',
        };
      case 'STATS_COPY':
      default:
        return {
          icon: Zap,
          badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          dotColor: 'bg-cyan-400',
          hoverBorder: 'hover:border-cyan-500/50',
        };
    }
  };

  const getPositionStyles = (pos: ToastPosition) => {
    switch (pos) {
      case 'bottom-right':
        return {
          placement: 'bottom-24 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-8 lg:bottom-10',
          exitClass: 'opacity-0 translate-y-2 pointer-events-none',
        };
      case 'top-left':
        return {
          placement: 'top-20 bottom-auto left-3 right-3 sm:right-auto sm:left-6 sm:top-24 sm:bottom-auto',
          exitClass: 'opacity-0 -translate-y-2 pointer-events-none',
        };
      case 'top-right':
        return {
          placement: 'top-20 bottom-auto left-3 right-3 sm:left-auto sm:right-6 sm:top-24 sm:bottom-auto',
          exitClass: 'opacity-0 -translate-y-2 pointer-events-none',
        };
      case 'bottom-left':
      default:
        return {
          placement: 'bottom-24 left-3 right-3 sm:right-auto sm:left-6 sm:bottom-8 lg:bottom-10',
          exitClass: 'opacity-0 translate-y-2 pointer-events-none',
        };
    }
  };

  const meta = getTypeMeta();
  const IconComponent = meta.icon;
  const posStyle = getPositionStyles(toastPosition);

  const isEn =
    language === 'en' ||
    (typeof window !== 'undefined' &&
      (window.location.pathname === '/en' || window.location.pathname.startsWith('/en/')));

  const localizeToastActor = (rawActor?: string): string => {
    const trimmed = (rawActor || '').trim();
    if (!trimmed) return t('mall.socialToast.customer');
    if (!isEn) return trimmed;

    const guestMatch = trimmed.match(/^Khách\s*#(.*)$/i);
    if (guestMatch) {
      return t('mall.socialToast.guestPrefix', { code: guestMatch[1].trim() });
    }
    if (/^Khách hàng$/i.test(trimmed)) return t('mall.socialToast.customer');
    if (/^Khách$/i.test(trimmed)) return t('mall.socialToast.guest');
    if (/^Thành viên$/i.test(trimmed)) return t('mall.socialToast.member');
    if (/^Hệ thống$/i.test(trimmed)) return t('mall.socialToast.system');
    return trimmed;
  };

  const localizeToastAmount = (rawAmount: string): string => {
    const trimmed = (rawAmount || '').trim();
    if (!isEn || !trimmed) return trimmed;
    return trimmed
      .replace(/(\d{1,3}(?:\.\d{3})+)\s*[đ₫]/gi, (_m, digits: string) => `${digits.replace(/\./g, ',')} VND`)
      .replace(/(\d+)\s*[đ₫]/gi, '$1 VND');
  };

  const localizeToastItemTitle = (rawTitle?: string): string => {
    const trimmed = (rawTitle || '').trim();
    if (!isEn || !trimmed) return trimmed;

    let resolved = trimmed;
    if (notification?.productId) {
      const storeProds = typeof dataService.getStoreProducts === 'function' ? dataService.getStoreProducts() : [];
      const matchedProd = storeProds.find((p) => p && p.id === notification.productId);
      if (matchedProd && (matchedProd as any).title_en) {
        resolved = String((matchedProd as any).title_en).trim();
      } else {
        resolved = contentTranslationService.translateField('product', notification.productId, 'name', resolved, 'en');
      }
    }

    return resolved
      .replace(/\s*-\s*Nạp Game\s*&\s*Gói Quà Tặng/gi, ' - Top-up & Gift Packages')
      .replace(/^Code riêng\s+/i, 'Exclusive Code ')
      .replace(/^Sự kiện\s+/i, 'Event ')
      .replace(/^Gói Quà Tặng\s*#(\d+)/i, 'Gift Package #$1')
      .replace(/^Mã Quà Tặng Mặc Định$/i, 'Default Giftcode')
      .replace(/^Gói nạp\s+/i, 'Top-up Pack ')
      .replace(/^Thẻ nạp\s+/i, 'Top-up Card ');
  };

  // Dynamic message localization (Song ngữ VI / EN) - Pure computation, zero hooks
  const getDisplayMessage = () => {
    if (!notification?.message) return '';
    const raw = notification.message.trim();

    if (isEn) {
      // Pattern 1: STATS_COPY
      if (
        notification.type === 'STATS_COPY' ||
        raw.includes('lượt sao chép giftcode') ||
        raw.includes('giftcode copies today')
      ) {
        const statsMatch = raw.match(/(?:Hệ thống vừa ghi nhận|Hôm nay đã có|System just recorded)\s+([\d.,]+)/i);
        const rawCount = statsMatch ? statsMatch[1] : (raw.match(/([\d.,]+)\s+(?:lượt sao chép|giftcode copies)/i)?.[1] || '');
        const normalizedCount = rawCount.replace(/\./g, ',');
        return t('mall.socialToast.trendingMessage', { count: normalizedCount || '1,000+' });
      }

      // Pattern 2: COPY_CODE
      if (raw.includes('vừa sao chép') || raw.includes('just copied') || notification.type === 'COPY_CODE') {
        const copyMatch = raw.match(/^(.*?)\s+vừa sao chép\s+(?:tất cả\s+(\d+)|(\d+))?\s*(?:mã code cho|mã giftcode cho|Giftcode game|Giftcode)?\s*(.*)$/i);
        if (copyMatch) {
          const user = localizeToastActor(copyMatch[1] || notification.userName);
          const countNum = parseInt(copyMatch[2] || copyMatch[3] || '1', 10) || 1;
          const game = (copyMatch[4]?.trim() || notification.gameName || 'Game');
          return countNum > 1
            ? t('mall.socialToast.copiedMultiple', { user, count: countNum, game })
            : t('mall.socialToast.copiedSingle', { user, game });
        }
        const enCopyMatch = raw.match(/^(.*?)\s+just copied\s+(?:all\s+(\d+)|(\d+))?\s*giftcodes?\s+for\s+(.*)$/i);
        if (enCopyMatch) {
          const user = localizeToastActor(enCopyMatch[1] || notification.userName);
          const countNum = parseInt(enCopyMatch[2] || enCopyMatch[3] || '1', 10) || 1;
          const game = enCopyMatch[4]?.trim() || notification.gameName || 'Game';
          return countNum > 1
            ? t('mall.socialToast.copiedMultiple', { user, count: countNum, game })
            : t('mall.socialToast.copiedSingle', { user, game });
        }
        return t('mall.socialToast.copiedSingle', {
          user: localizeToastActor(notification.userName),
          game: notification.gameName || 'Game',
        });
      }

      // Pattern 3: BUY_PRODUCT
      if (raw.includes('vừa mua') || raw.includes('just purchased') || notification.type === 'BUY_PRODUCT') {
        const buyMatch = raw.match(/^(.*?)\s+(?:vừa mua(?: thành công)?|just purchased)\s+(?:(\d+x)\s+)?(.*)$/i);
        if (buyMatch) {
          const user = localizeToastActor(buyMatch[1] || notification.userName);
          const qty = buyMatch[2] ? `${buyMatch[2]} ` : '';
          const item = localizeToastItemTitle(buyMatch[3] || notification.productName || 'Package');
          return t('mall.socialToast.purchasedItem', { user, item: `${qty}${item}` });
        }
        return t('mall.socialToast.purchasedItem', {
          user: localizeToastActor(notification.userName),
          item: localizeToastItemTitle(notification.productName || 'Package'),
        });
      }

      // Pattern 4: DEPOSIT_WALLET (including "vừa được nạp +X Core vào ví" and "vừa nạp thành công ... (+X Core)")
      if (
        raw.includes('vừa nạp') ||
        raw.includes('vừa được nạp') ||
        raw.includes('just topped up') ||
        notification.type === 'DEPOSIT_WALLET'
      ) {
        const creditedMatch = raw.match(/^(.*?)\s+vừa được nạp\s+\+?([\d.,]+)\s*Core(?:\s+vào ví)?/i);
        if (creditedMatch) {
          const user = localizeToastActor(creditedMatch[1] || notification.userName);
          const amount = creditedMatch[2].replace(/\./g, ',');
          return t('mall.socialToast.creditedCore', { user, amount });
        }

        const depositMatch = raw.match(/^(.*?)\s+vừa nạp(?: thành công)?\s+([\d.,]+\s*(?:đ|₫|Core)?)\s*(\(\+[\d.,]+\s*Core\))?\s*(qua SePay|vào ví Core)?(.*)$/i);
        if (depositMatch) {
          const user = localizeToastActor(depositMatch[1] || notification.userName);
          const baseAmount = localizeToastAmount(depositMatch[2] || '');
          const bonusCore = depositMatch[3] ? ` ${depositMatch[3].replace(/\./g, ',')}` : '';
          const fullAmount = `${baseAmount}${bonusCore}`.trim();
          const channel = (depositMatch[4] || '').toLowerCase();
          if (channel === 'qua sepay') {
            return t('mall.socialToast.toppedUpViaSepay', { user, amount: fullAmount });
          }
          if (channel === 'vào ví core') {
            return t('mall.socialToast.toppedUpCoreWallet', { user, amount: fullAmount });
          }
          return t('mall.socialToast.toppedUpGeneric', { user, amount: fullAmount });
        }

        return t('mall.socialToast.toppedUpGeneric', {
          user: localizeToastActor(notification.userName),
          amount: 'Core',
        });
      }

      // Pattern 5: CLAIM_GIVEAWAY
      if (raw.includes('vừa nhận') || raw.includes('just claimed') || notification.type === 'CLAIM_GIVEAWAY') {
        const claimMatch = raw.match(/^(.*?)\s+(?:vừa nhận(?:\s+mã quà tặng sự kiện|\s+thành công(?:\s+giftcode)?|\s+giftcode)?|just claimed(?:\s+event giftcode for)?)\s+(.*)$/i);
        if (claimMatch) {
          const user = localizeToastActor(claimMatch[1] || notification.userName);
          const rawCampaign = (claimMatch[2] || notification.giveawayTitle || 'Event').replace(/^giftcode\s+/i, '').trim();
          const campaign = localizeToastItemTitle(rawCampaign);
          return t('mall.socialToast.claimedGiveaway', { user, campaign });
        }
        return t('mall.socialToast.claimedGiveaway', {
          user: localizeToastActor(notification.userName),
          campaign: localizeToastItemTitle(notification.giveawayTitle || 'Event'),
        });
      }

      // Pattern 6: RESTOCK_PRODUCT
      if (
        raw.includes('vừa được nạp thêm') ||
        raw.includes('vừa bổ sung thêm') ||
        raw.includes('Kho hàng') ||
        raw.includes('Sự kiện') ||
        notification.type === 'RESTOCK_PRODUCT'
      ) {
        const restockGwMatch = raw.match(/^Sự kiện\s+(.*?)\s+vừa được nạp thêm\s+\+(\d+)\s+mã quà tặng mới!?$/i);
        if (restockGwMatch) {
          return t('mall.socialToast.restockedGiveaway', {
            title: localizeToastItemTitle(restockGwMatch[1]),
            count: restockGwMatch[2],
          });
        }
        const restockProdMatch = raw.match(/^Kho hàng vừa bổ sung thêm\s+\+(\d+)\s+(.*?)!?$/i);
        if (restockProdMatch) {
          return t('mall.socialToast.restockedProduct', {
            count: restockProdMatch[1],
            title: localizeToastItemTitle(restockProdMatch[2]),
          });
        }
        return t('mall.socialToast.restockedProduct', {
          count: 5,
          title: localizeToastItemTitle(notification.productName || notification.giveawayTitle || 'Items'),
        });
      }

      return raw;
    }

    // Language === 'vi'
    const statsEnMatch = raw.match(/^System just recorded\s+([\d.,]+)\s+giftcode copies today!?$/i);
    if (statsEnMatch) {
      return t('mall.socialToast.trendingMessage', { count: statsEnMatch[1] });
    }

    return raw;
  };

  const getDisplayTitle = () => {
    if (!notification?.title) return '';
    if (notification.type === 'COPY_CODE' || notification.title.includes('Sao chép')) {
      return t('mall.socialToast.copyCodeTitle');
    }
    if (notification.type === 'BUY_PRODUCT' || notification.title.includes('Đơn hàng') || notification.title.includes('Mua hàng')) {
      return t('mall.socialToast.orderTitle');
    }
    if (notification.type === 'CLAIM_GIVEAWAY' || notification.title.includes('Nhận quà')) {
      return t('mall.socialToast.claimTitle');
    }
    if (notification.type === 'DEPOSIT_WALLET' || notification.title.includes('Nạp') || notification.title.includes('Cộng Core')) {
      return t('mall.socialToast.depositTitle');
    }
    if (
      notification.type === 'RESTOCK_PRODUCT' ||
      notification.title.includes('cập nhật kho') ||
      notification.title.includes('Nạp thêm') ||
      notification.title.includes('Bổ sung')
    ) {
      return t('mall.socialToast.restockTitle');
    }
    if (notification.type === 'STATS_COPY' || notification.title.includes('Sôi động') || notification.title.includes('Thống kê')) {
      return t('mall.socialToast.trendingTitle');
    }
    return isEn ? t('mall.socialToast.orderTitle') : notification.title;
  };

  const getDisplayTimeAgo = () => {
    if (!notification?.timeAgo) return '';
    const raw = notification.timeAgo.trim();
    const lower = raw.toLowerCase();

    if (lower === 'vừa xong' || lower === 'vừa nãy' || lower === 'just now') {
      return t('mall.socialToast.justNow');
    }
    const minMatch = raw.match(/(\d+)\s*(?:phút trước|m ago)/i);
    if (minMatch) {
      return t('mall.socialToast.minutesAgo', { count: minMatch[1] });
    }
    const hourMatch = raw.match(/(\d+)\s*(?:giờ trước|h ago)/i);
    if (hourMatch) {
      return t('mall.socialToast.hoursAgo', { count: hourMatch[1] });
    }
    const secMatch = raw.match(/(\d+)\s*(?:giây trước|s trước|s ago)/i);
    if (secMatch) {
      return t('mall.socialToast.secondsAgo', { count: secMatch[1] });
    }
    return isEn ? t('mall.socialToast.justNow') : raw;
  };

  const displayMessage = getDisplayMessage();
  const displayTitle = getDisplayTitle();
  const displayTimeAgo = getDisplayTimeAgo();

  return (
    <div
      role="alert"
      aria-live="polite"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        const config = marketingService.getConfig();
        const duration = Math.max(2, config.displayDuration || 4) * 1000;
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(dismissNotification, duration);
      }}
      onClick={handleClickToast}
      className={`fixed ${posStyle.placement} z-[95] pointer-events-auto sm:max-w-sm w-auto box-border transition-all duration-300 select-none cursor-pointer ${
        isExiting
          ? posStyle.exitClass
          : 'opacity-100 translate-y-0'
      }`}
      style={{
        maxWidth: 'calc(100vw - 24px)',
        willChange: 'transform, opacity',
      }}
    >
      <div
        className={`relative flex items-start gap-2.5 p-3 sm:p-3.5 pb-2.5 sm:pb-3 rounded-2xl bg-card/95 backdrop-blur-md border border-border/80 shadow-2xl ${meta.hoverBorder} transition-all duration-200 group active:scale-[0.98] w-full max-w-full box-border min-h-[76px] sm:min-h-[80px]`}
      >
        {/* Subtle accent highlight line */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />

        {/* Icon Avatar */}
        <div className="relative shrink-0">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border shadow-sm ${meta.badgeColor}`}
          >
            <IconComponent className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          {/* Pulsing online dot */}
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${meta.dotColor} ring-2 ring-card animate-pulse`}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-4 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 mb-0.5">
            <span className="text-[10px] sm:text-[11px] font-bold tracking-tight text-foreground truncate flex items-center gap-1 min-w-0">
              <span className="truncate">{displayTitle}</span>
              <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            </span>
            <span
              className="text-[9px] sm:text-[10px] font-mono shrink-0 px-1.5 py-0.5 rounded-md text-muted-foreground bg-muted/60"
            >
              {displayTimeAgo}
            </span>
          </div>

          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug line-clamp-2 break-words break-all font-medium overflow-hidden">
            {displayMessage}
          </p>

          {/* Interactive Action Hint & Snooze Option */}
          <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-border/40 min-w-0">
            <div className="flex items-center gap-0.5 text-[10px] sm:text-[11px] text-primary dark:text-primary-light font-semibold group-hover:underline shrink-0">
              <span>{t('mall.socialToast.viewDetails')}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </div>

            <button
              type="button"
              onClick={snoozeForOneHour}
              className="text-[9px] sm:text-[10px] text-muted-foreground/80 hover:text-foreground hover:bg-muted/70 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 truncate max-w-[140px]"
              title={t('mall.socialToast.muteTooltip')}
            >
              <BellOff className="w-2.5 h-2.5 shrink-0" />
              <span className="hidden sm:inline">{t('mall.socialToast.mute1h')}</span>
              <span className="sm:hidden">{t('mall.socialToast.mute1hShort')}</span>
            </button>
          </div>
        </div>

        {/* Close Button (✕) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismissNotification();
          }}
          className="absolute top-2 right-2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          title={t('mall.socialToast.close')}
          aria-label={t('mall.socialToast.close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
