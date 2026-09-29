import { jsonRequest, unwrap } from './client';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;
export const SITE_DESCRIPTION_MAX_LENGTH = 300;
export const SITE_URL_MAX_LENGTH = 2048;

export type SiteView = 'list' | 'grid';

/** Header controls an administrator can hide for every visitor. */
export type SiteFlag = 'hideGithubLink' | 'hideLanguageSelector' | 'hideLogin';

export interface SiteSettings extends Record<SiteFlag, boolean> {
  title: string;
  defaultView: SiteView;
  /** Link-preview description; empty means none. */
  description: string;
  /** Link-preview thumbnail URL (absolute, or a path on this site); empty means none. */
  imageUrl: string;
  /** Browser-tab icon URL (absolute, or a path on this site); empty means the browser default. */
  faviconUrl: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  title: DEFAULT_SITE_TITLE,
  defaultView: 'list',
  description: '',
  imageUrl: '',
  faviconUrl: '',
  hideGithubLink: false,
  hideLanguageSelector: false,
  hideLogin: false,
};

export function isSiteView(value: unknown): value is SiteView {
  return value === 'list' || value === 'grid';
}

function textOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Title and view are required; anything else that is absent (older response or cache) means "not set / shown". */
export function parseSiteSettings(data: Partial<Record<keyof SiteSettings, unknown>> | null | undefined): SiteSettings | null {
  if (typeof data?.title !== 'string' || !data.title || !isSiteView(data.defaultView)) return null;
  return {
    title: data.title,
    defaultView: data.defaultView,
    description: textOrEmpty(data.description),
    imageUrl: textOrEmpty(data.imageUrl),
    faviconUrl: textOrEmpty(data.faviconUrl),
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

/** Saves only the provided site-wide settings (administrators only). An empty text value clears that setting. */
export async function saveSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  return jsonRequest<SiteSettings>('/api/admin/site', { method: 'PUT', body: JSON.stringify(patch) });
}
