import { jsonRequest, unwrap } from './client';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;

export type SiteView = 'list' | 'grid';

/** Header controls an administrator can hide for every visitor. */
export type SiteFlag = 'hideGithubLink' | 'hideLanguageSelector' | 'hideLogin';

export interface SiteSettings extends Record<SiteFlag, boolean> {
  title: string;
  defaultView: SiteView;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: DEFAULT_SITE_TITLE,
  defaultView: 'list',
  hideGithubLink: false,
  hideLanguageSelector: false,
  hideLogin: false,
};

export function isSiteView(value: unknown): value is SiteView {
  return value === 'list' || value === 'grid';
}

/** Title and view are required; a flag that is absent (older response or cache) simply means "shown". */
export function parseSiteSettings(data: Partial<Record<keyof SiteSettings, unknown>> | null | undefined): SiteSettings | null {
  if (typeof data?.title !== 'string' || !data.title || !isSiteView(data.defaultView)) return null;
  return {
    title: data.title,
    defaultView: data.defaultView,
    hideGithubLink: data.hideGithubLink === true,
    hideLanguageSelector: data.hideLanguageSelector === true,
    hideLogin: data.hideLogin === true,
  };
}

export async function getSiteSettings(signal?: AbortSignal): Promise<SiteSettings> {
  const data = await unwrap<Partial<Record<keyof SiteSettings, unknown>>>(await fetch('/api/site', { signal, credentials: 'same-origin' }));
  const settings = parseSiteSettings(data);
  if (!settings) throw new Error('Invalid site settings response');
  return settings;
}

/** Saves only the provided site-wide settings (administrators only). An empty title restores the default. */
export async function saveSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  return jsonRequest<SiteSettings>('/api/admin/site', { method: 'PUT', body: JSON.stringify(patch) });
}
