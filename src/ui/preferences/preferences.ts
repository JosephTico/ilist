export const PREFERENCES_KEY = 'ilist.ui.preferences';

export type Locale = 'en' | 'zh-CN';
export type ThemePreference = 'system' | 'light' | 'dark';
export type ExplorerViewPreference = 'list' | 'grid';

export interface UiPreferences {
  version: 1;
  locale: Locale;
  theme: ThemePreference;
  /** The visitor's own choice; null means "follow the site-wide default". */
  defaultView: ExplorerViewPreference | null;
}

export function defaultPreferences(): UiPreferences {
  return {
    version: 1,
    locale: navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en',
    theme: 'system',
    defaultView: null,
  };
}

export function readPreferences(storage?: Storage): UiPreferences {
  try {
    const value = JSON.parse((storage ?? window.localStorage).getItem(PREFERENCES_KEY) ?? 'null') as Partial<UiPreferences> | null;
    if (
      value?.version !== 1
      || !['en', 'zh-CN'].includes(value.locale ?? '')
      || !['system', 'light', 'dark'].includes(value.theme ?? '')
      || (value.defaultView !== null && !['list', 'grid'].includes(value.defaultView ?? ''))
    ) {
      return defaultPreferences();
    }
    return value as UiPreferences;
  } catch {
    return defaultPreferences();
  }
}

export function writePreferences(value: UiPreferences, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    // Browser storage can be unavailable.
  }
}
