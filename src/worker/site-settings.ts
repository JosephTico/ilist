import { HttpError } from './http';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;
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
}

export interface SiteSettingsPatch extends Partial<Record<SiteFlag, boolean>> {
  /** null removes the override so the default title applies again. */
  title?: string | null;
  defaultView?: SiteView;
}

const TITLE_KEY = 'site.title';
const VIEW_KEY = 'site.defaultView';
const FLAG_NAMES = Object.keys(FLAG_KEYS) as SiteFlag[];

function isSiteView(value: unknown): value is SiteView {
  return value === 'list' || value === 'grid';
}

/** Trims and validates a title. Returns null for an empty value, meaning "use the default". */
export function normalizeSiteTitle(value: unknown): string | null {
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_SITE_TITLE', 'Site title must be a string');
  const title = value.trim();
  if (!title) return null;
  if ([...title].length > SITE_TITLE_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new HttpError(400, 'INVALID_SITE_TITLE', `Site title must be at most ${SITE_TITLE_MAX_LENGTH} characters without control characters`);
  }
  return title;
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
  for (const flag of FLAG_NAMES) {
    if (!(flag in input)) continue;
    if (typeof input[flag] !== 'boolean') throw new HttpError(400, 'INVALID_SITE_SETTINGS', `${flag} must be true or false`);
    patch[flag] = input[flag];
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'INVALID_SITE_SETTINGS', 'Provide at least one site setting');
  return patch;
}

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const keys = [TITLE_KEY, VIEW_KEY, ...Object.values(FLAG_KEYS)];
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
    ...flags,
  };
}

/** Applies only the provided fields, in one batch so a partial update is never visible. */
export async function updateSiteSettings(db: D1Database, patch: SiteSettingsPatch): Promise<SiteSettings> {
  const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const remove = 'DELETE FROM settings WHERE key = ?';
  const statements: D1PreparedStatement[] = [];
  if (patch.title === null) statements.push(db.prepare(remove).bind(TITLE_KEY));
  else if (patch.title !== undefined) statements.push(db.prepare(upsert).bind(TITLE_KEY, patch.title));
  if (patch.defaultView !== undefined) statements.push(db.prepare(upsert).bind(VIEW_KEY, patch.defaultView));
  for (const flag of FLAG_NAMES) {
    const value = patch[flag];
    if (value === undefined) continue;
    statements.push(value ? db.prepare(upsert).bind(FLAG_KEYS[flag], 'true') : db.prepare(remove).bind(FLAG_KEYS[flag]));
  }
  if (statements.length) await db.batch(statements);
  return getSiteSettings(db);
}
