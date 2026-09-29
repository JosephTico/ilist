import { jsonRequest, unwrap } from './client';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;

export type SiteView = 'list' | 'grid';

export interface SiteSettings {
  title: string;
  defaultView: SiteView;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = { title: DEFAULT_SITE_TITLE, defaultView: 'list' };

export function isSiteView(value: unknown): value is SiteView {
  return value === 'list' || value === 'grid';
}

export async function getSiteSettings(signal?: AbortSignal): Promise<SiteSettings> {
  const data = await unwrap<Partial<Record<keyof SiteSettings, unknown>>>(await fetch('/api/site', { signal, credentials: 'same-origin' }));
  if (typeof data?.title !== 'string' || !data.title || !isSiteView(data.defaultView)) throw new Error('Invalid site settings response');
  return { title: data.title, defaultView: data.defaultView };
}

/** Saves only the provided site-wide settings (administrators only). An empty title restores the default. */
export async function saveSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  return jsonRequest<SiteSettings>('/api/admin/site', { method: 'PUT', body: JSON.stringify(patch) });
}
