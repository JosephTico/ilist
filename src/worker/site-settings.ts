import { HttpError } from './http';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;
export const SITE_DESCRIPTION_MAX_LENGTH = 300;
export const SITE_URL_MAX_LENGTH = 2048;
export const DEFAULT_SITE_VIEW = 'list';

export type SiteView = 'list' | 'grid';

/** Header controls an administrator may hide for every visitor. Absent from storage means shown. */
const FLAG_KEYS = {
  hideGithubLink: 'site.hideGithubLink',
  hideLanguageSelector: 'site.hideLanguageSelector',
  hideLogin: 'site.hideLogin',
} as const;

export type SiteFlag = keyof typeof FLAG_KEYS;

export interface SiteSettings extends Record<SiteFlag, boolean> {
  title: string;
  defaultView: SiteView;
  /** Link-preview description; empty means none. */
  description: string;
  /** Link-preview thumbnail: an absolute http(s) URL or a site-relative path; empty means none. */
  imageUrl: string;
  /** Browser-tab icon, same URL rules as `imageUrl`; empty means the browser default. */
  faviconUrl: string;
}

export interface SiteSettingsPatch extends Partial<Record<SiteFlag, boolean>> {
  /** null removes the override so the default title applies again. */
  title?: string | null;
  defaultView?: SiteView;
  /** Empty string removes the value. */
  description?: string;
  imageUrl?: string;
  faviconUrl?: string;
}

const TITLE_KEY = 'site.title';
const VIEW_KEY = 'site.defaultView';
const DESCRIPTION_KEY = 'site.description';
const IMAGE_KEY = 'site.imageUrl';
const FAVICON_KEY = 'site.faviconUrl';
const FLAG_NAMES = Object.keys(FLAG_KEYS) as SiteFlag[];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isSiteView(value: unknown): value is SiteView {
  return value === 'list' || value === 'grid';
}

/** Trims and validates a title. Returns null for an empty value, meaning "use the default". */
export function normalizeSiteTitle(value: unknown): string | null {
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_SITE_TITLE', 'Site title must be a string');
  const title = value.trim();
  if (!title) return null;
  if ([...title].length > SITE_TITLE_MAX_LENGTH || CONTROL_CHARACTERS.test(title)) {
    throw new HttpError(400, 'INVALID_SITE_TITLE', `Site title must be at most ${SITE_TITLE_MAX_LENGTH} characters without control characters`);
  }
  return title;
}

export function normalizeSiteDescription(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_SITE_DESCRIPTION', 'Site description must be a string');
  const description = value.trim();
  if ([...description].length > SITE_DESCRIPTION_MAX_LENGTH || CONTROL_CHARACTERS.test(description)) {
    throw new HttpError(400, 'INVALID_SITE_DESCRIPTION', `Site description must be at most ${SITE_DESCRIPTION_MAX_LENGTH} characters on one line`);
  }
  return description;
}

/** Accepts an absolute http(s) URL without credentials, or a single-slash site-relative path. Empty clears. */
export function normalizeSiteUrl(value: unknown, code: string, label: string): string {
  if (typeof value !== 'string') throw new HttpError(400, code, `${label} must be a string`);
  const url = value.trim();
  if (!url) return '';
  const invalid = () => new HttpError(400, code, `${label} must be an http(s) URL or a path starting with a single /`);
  if (url.length > SITE_URL_MAX_LENGTH || CONTROL_CHARACTERS.test(url) || /\s/.test(url)) throw invalid();
  if (url.startsWith('/')) {
    if (url.startsWith('//') || url.includes('\\')) throw invalid();
    return url;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid();
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) throw invalid();
  return url;
}

export function parseSiteView(value: unknown): SiteView {
  if (!isSiteView(value)) throw new HttpError(400, 'INVALID_SITE_VIEW', 'Default view must be "list" or "grid"');
  return value;
}

/** Validates a request body into a patch containing only the settings it names; rejects an empty patch. */
export function parseSiteSettingsPatch(body: unknown): SiteSettingsPatch {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'INVALID_SITE_SETTINGS', 'Site settings must be an object');
  }
  const input = body as Record<string, unknown>;
  const patch: SiteSettingsPatch = {};
  if ('title' in input) patch.title = normalizeSiteTitle(input.title);
  if ('defaultView' in input) patch.defaultView = parseSiteView(input.defaultView);
  if ('description' in input) patch.description = normalizeSiteDescription(input.description);
  if ('imageUrl' in input) patch.imageUrl = normalizeSiteUrl(input.imageUrl, 'INVALID_SITE_IMAGE_URL', 'Preview image');
  if ('faviconUrl' in input) patch.faviconUrl = normalizeSiteUrl(input.faviconUrl, 'INVALID_SITE_FAVICON_URL', 'Favicon');
  for (const flag of FLAG_NAMES) {
    if (!(flag in input)) continue;
    if (typeof input[flag] !== 'boolean') throw new HttpError(400, 'INVALID_SITE_SETTINGS', `${flag} must be true or false`);
    patch[flag] = input[flag];
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'INVALID_SITE_SETTINGS', 'Provide at least one site setting');
  return patch;
}

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const keys = [TITLE_KEY, VIEW_KEY, DESCRIPTION_KEY, IMAGE_KEY, FAVICON_KEY, ...Object.values(FLAG_KEYS)];
  const { results } = await db
    .prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(', ')})`)
    .bind(...keys)
    .all<{ key: string; value: string }>();
  const stored = new Map(results.map((row) => [row.key, row.value]));
  const view = stored.get(VIEW_KEY);
  const flags = Object.fromEntries(FLAG_NAMES.map((flag) => [flag, stored.get(FLAG_KEYS[flag]) === 'true'])) as Record<SiteFlag, boolean>;
  return {
    title: stored.get(TITLE_KEY) ?? DEFAULT_SITE_TITLE,
    defaultView: isSiteView(view) ? view : DEFAULT_SITE_VIEW,
    description: stored.get(DESCRIPTION_KEY) ?? '',
    imageUrl: stored.get(IMAGE_KEY) ?? '',
    faviconUrl: stored.get(FAVICON_KEY) ?? '',
    ...flags,
  };
}

/** Applies only the provided fields, in one batch so a partial update is never visible. */
export async function updateSiteSettings(db: D1Database, patch: SiteSettingsPatch): Promise<SiteSettings> {
  const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const remove = 'DELETE FROM settings WHERE key = ?';
  const statements: D1PreparedStatement[] = [];
  // A null or empty value removes the row so the default applies again.
  const setOrRemove = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    statements.push(value ? db.prepare(upsert).bind(key, value) : db.prepare(remove).bind(key));
  };
  setOrRemove(TITLE_KEY, patch.title);
  setOrRemove(DESCRIPTION_KEY, patch.description);
  setOrRemove(IMAGE_KEY, patch.imageUrl);
  setOrRemove(FAVICON_KEY, patch.faviconUrl);
  if (patch.defaultView !== undefined) statements.push(db.prepare(upsert).bind(VIEW_KEY, patch.defaultView));
  for (const flag of FLAG_NAMES) {
    const value = patch[flag];
    if (value !== undefined) setOrRemove(FLAG_KEYS[flag], value ? 'true' : null);
  }
  if (statements.length) await db.batch(statements);
  return getSiteSettings(db);
}
