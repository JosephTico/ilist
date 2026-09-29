import { HttpError } from './http';

export const DEFAULT_SITE_TITLE = 'iList';
export const SITE_TITLE_MAX_LENGTH = 60;
export const DEFAULT_SITE_VIEW = 'list';

export type SiteView = 'list' | 'grid';

export interface SiteSettings {
  title: string;
  defaultView: SiteView;
}

const TITLE_KEY = 'site.title';
const VIEW_KEY = 'site.defaultView';

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

export async function getSiteSettings(db: D1Database): Promise<SiteSettings> {
  const { results } = await db
    .prepare('SELECT key, value FROM settings WHERE key IN (?, ?)')
    .bind(TITLE_KEY, VIEW_KEY)
    .all<{ key: string; value: string }>();
  const stored = new Map(results.map((row) => [row.key, row.value]));
  const view = stored.get(VIEW_KEY);
  return {
    title: stored.get(TITLE_KEY) ?? DEFAULT_SITE_TITLE,
    defaultView: isSiteView(view) ? view : DEFAULT_SITE_VIEW,
  };
}

/**
 * Applies only the provided fields. A null title removes the override so the default applies again.
 * Both writes go in one batch so a partial update is never visible.
 */
export async function updateSiteSettings(
  db: D1Database,
  patch: { title?: string | null; defaultView?: SiteView },
): Promise<SiteSettings> {
  const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
  const statements: D1PreparedStatement[] = [];
  if (patch.title === null) statements.push(db.prepare('DELETE FROM settings WHERE key = ?').bind(TITLE_KEY));
  else if (patch.title !== undefined) statements.push(db.prepare(upsert).bind(TITLE_KEY, patch.title));
  if (patch.defaultView !== undefined) statements.push(db.prepare(upsert).bind(VIEW_KEY, patch.defaultView));
  if (statements.length) await db.batch(statements);
  return getSiteSettings(db);
}
