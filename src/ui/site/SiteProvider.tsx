import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SITE_SETTINGS, getSiteSettings, isSiteView, saveSiteSettings, type SiteSettings } from '../api/site';

const SITE_SETTINGS_CACHE_KEY = 'ilist.ui.siteSettings';

interface SiteContextValue extends SiteSettings {
  /** Persists site-wide settings (administrators only) and applies the stored result. */
  saveSettings: (patch: Partial<SiteSettings>) => Promise<SiteSettings>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

function readCachedSettings(): SiteSettings {
  try {
    const value = JSON.parse(window.localStorage.getItem(SITE_SETTINGS_CACHE_KEY) ?? 'null') as Partial<SiteSettings> | null;
    return {
      title: typeof value?.title === 'string' && value.title ? value.title : DEFAULT_SITE_SETTINGS.title,
      defaultView: isSiteView(value?.defaultView) ? value.defaultView : DEFAULT_SITE_SETTINGS.defaultView,
    };
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

export function SiteProvider({ children }: PropsWithChildren) {
  // The last known settings are cached so returning visitors do not see defaults flash before the fetch.
  const [settings, setSettings] = useState(readCachedSettings);

  useEffect(() => {
    const controller = new AbortController();
    void getSiteSettings(controller.signal).then(setSettings).catch(() => {
      // Header, tab title, and default view stay on the cached/default values when the settings cannot be fetched.
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.title = settings.title;
    try {
      window.localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
    } catch {
      // Storage may be unavailable (private mode); the cache is only an optimisation.
    }
  }, [settings]);

  const saveSettings = useCallback(async (patch: Partial<SiteSettings>) => {
    const saved = await saveSiteSettings(patch);
    setSettings(saved);
    return saved;
  }, []);

  const value = useMemo(() => ({ ...settings, saveSettings }), [settings, saveSettings]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const value = useContext(SiteContext);
  if (!value) throw new Error('useSite must be used within SiteProvider');
  return value;
}
