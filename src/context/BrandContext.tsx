import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
  BRAND_STORAGE_CACHE_KEY,
  BRAND_UPDATED_EVENT,
  DEFAULT_BRAND_IDENTITY,
  type BrandIdentityConfig,
  getActiveBrandIdentity,
  reloadBrandFromStorage,
  setActiveBrandIdentity,
} from '../utils/brandRuntime';
import { broadcastCrossTabEvent, subscribeCrossTabEvents } from '../utils/crossTabSync';

interface BrandContextValue {
  brand: BrandIdentityConfig;
  updateBrandLocal: (next: Partial<BrandIdentityConfig>, broadcast?: boolean) => BrandIdentityConfig;
  refreshBrandFromServer: (forceFresh?: boolean) => Promise<BrandIdentityConfig>;
  isRefreshing: boolean;
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

function applyBrandDocumentAssets(brand: BrandIdentityConfig) {
  if (typeof document === 'undefined') return;
  try {
    if (brand.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'shortcut icon';
        document.head.appendChild(link);
      }
      if (link.getAttribute('href') !== brand.faviconUrl) {
        link.href = brand.faviconUrl;
      }
    }
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle && brand.shortName) {
      appleTitle.setAttribute('content', brand.shortName);
    }
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite && brand.brandName) {
      ogSite.setAttribute('content', brand.brandName);
    }
  } catch {}
}

export const BrandProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [brand, setBrandState] = useState<BrandIdentityConfig>(() => getActiveBrandIdentity());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updateBrandLocal = useCallback(
    (next: Partial<BrandIdentityConfig>, broadcast = false): BrandIdentityConfig => {
      const updated = setActiveBrandIdentity(next, { persist: true, emitEvent: true });
      setBrandState(updated);
      applyBrandDocumentAssets(updated);
      if (broadcast) {
        broadcastCrossTabEvent('BRAND_UPDATED', { brand: updated });
      }
      return updated;
    },
    []
  );

  const refreshBrandFromServer = useCallback(async (forceFresh = false): Promise<BrandIdentityConfig> => {
    setIsRefreshing(true);
    try {
      const url = forceFresh ? `/api/brand?fresh=1&_t=${Date.now()}` : '/api/brand';
      const res = await fetch(url, { cache: forceFresh ? 'no-store' : 'default' });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.success && data?.brand) {
          const updated = setActiveBrandIdentity(data.brand, { persist: true, emitEvent: true });
          setBrandState(updated);
          applyBrandDocumentAssets(updated);
          return updated;
        }
      }
    } catch {} finally {
      setIsRefreshing(false);
    }
    return getActiveBrandIdentity();
  }, []);

  useEffect(() => {
    applyBrandDocumentAssets(brand);
  }, [brand]);

  // Background fresh fetch on mount to catch Edge brand changes even when HTML wasn't SSR-hydrated
  useEffect(() => {
    refreshBrandFromServer(false).catch(() => {});
  }, [refreshBrandFromServer]);

  // Listen to same-tab custom events, legacy CMS updates, localStorage & cross-tab BroadcastChannel
  useEffect(() => {
    const onBrandUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail && typeof detail === 'object') {
        setBrandState(detail as BrandIdentityConfig);
      } else {
        setBrandState(getActiveBrandIdentity());
      }
    };

    const onLegacyContentUpdated = () => {
      const reloaded = reloadBrandFromStorage();
      setBrandState(reloaded);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === BRAND_STORAGE_CACHE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const updated = setActiveBrandIdentity(parsed, { persist: false, emitEvent: true });
          setBrandState(updated);
        } catch {}
      } else if (e.key === 'pine_admin_content_v4') {
        onLegacyContentUpdated();
      }
    };

    const unsubCrossTab = subscribeCrossTabEvents((ev) => {
      if (ev.type === 'BRAND_UPDATED' && ev.brand) {
        const updated = setActiveBrandIdentity(ev.brand, { persist: true, emitEvent: true });
        setBrandState(updated);
      }
    });

    window.addEventListener(BRAND_UPDATED_EVENT, onBrandUpdated);
    window.addEventListener('pine_admin_content_updated', onLegacyContentUpdated);
    window.addEventListener('storage', onStorage);

    return () => {
      unsubCrossTab();
      window.removeEventListener(BRAND_UPDATED_EVENT, onBrandUpdated);
      window.removeEventListener('pine_admin_content_updated', onLegacyContentUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const value = useMemo(
    () => ({
      brand,
      updateBrandLocal,
      refreshBrandFromServer,
      isRefreshing,
    }),
    [brand, updateBrandLocal, refreshBrandFromServer, isRefreshing]
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
};

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) {
    return {
      brand: getActiveBrandIdentity() || DEFAULT_BRAND_IDENTITY,
      updateBrandLocal: (next) => setActiveBrandIdentity(next),
      refreshBrandFromServer: async () => getActiveBrandIdentity(),
      isRefreshing: false,
    };
  }
  return ctx;
}

export { DEFAULT_BRAND_IDENTITY };
export type { BrandIdentityConfig };
