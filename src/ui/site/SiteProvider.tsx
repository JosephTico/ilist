import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SITE_SETTINGS, getSiteSettings, parseSiteSettings, saveSiteSettings, type SiteSettings } from '../api/site';

const SITE_SETTINGS_CACHE_KEY = 'ilist.ui.siteSettings';

interface SiteContextValue extends SiteSettings {
  /** Persists site-wide settings (administrators only) and applies the stored result. */
  saveSettings: (patch: Partial<SiteSettings>) => Promise<SiteSettings>;
}

const SiteContext = createContext<SiteContextValue | null>(null);

function readCachedSettings(): SiteSettings {
  let cached = DEFAULT_SITE_SETTINGS;
  try {
    const value = JSON.parse(window.localStorage.getItem(SITE_SETTINGS_CACHE_KEY) ?? 'null') as Partial<SiteSettings> | null;
    cached = parseSiteSettings(value) ?? DEFAULT_SITE_SETTINGS;
  } catch {
    // Unreadable or unavailable storage: fall back to the defaults.
  }
  // The Worker writes the current title into the served HTML, which is newer than any cache; the static
  // fallback title in index.html is not, so it is ignored.
  const servedTitle = document.title;
  return servedTitle && servedTitle !== DEFAULT_SITE_SETTINGS.title ? { ...cached, title: servedTitle } : cached;
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

  // The server writes the icon into the served HTML; this keeps it current after an administrator changes it.
  useEffect(() => {
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!settings.faviconUrl) {
      link?.remove();
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.faviconUrl;
  }, [settings.faviconUrl]);

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
