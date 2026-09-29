import { RotateCcw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { isSiteView, SITE_DESCRIPTION_MAX_LENGTH, SITE_TITLE_MAX_LENGTH, SITE_URL_MAX_LENGTH, type SiteFlag } from '../api/site';
import { useI18n } from '../i18n/I18nProvider';
import { localizedApiError } from '../i18n/apiErrors';
import type { MessageKey } from '../i18n/messages';
import { defaultPreferences, type Locale, type ThemePreference } from '../preferences/preferences';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useSite } from '../site/SiteProvider';

/** Header controls an administrator can hide for everyone; the label names the action, so a ticked box means hidden. */
const HEADER_CONTROLS: ReadonlyArray<{ flag: SiteFlag; label: MessageKey; hint?: MessageKey }> = [
  { flag: 'hideGithubLink', label: 'site.hideGithub' },
  { flag: 'hideLanguageSelector', label: 'site.hideLanguage' },
  { flag: 'hideLogin', label: 'site.hideLogin', hint: 'site.hideLoginHint' },
];

const DETAIL_FIELDS = ['title', 'description', 'imageUrl', 'faviconUrl'] as const;
type DetailField = (typeof DETAIL_FIELDS)[number];

export function PreferencesPage() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();
  const site = useSite();
  const [drafts, setDrafts] = useState<Partial<Record<DetailField, string>>>({});
  const [detailsStatus, setDetailsStatus] = useState<{ tone: 'saved' | 'error'; message: string } | null>(null);
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const detailValue = (field: DetailField) => drafts[field] ?? site[field];
  const changedDetails = DETAIL_FIELDS.filter((field) => drafts[field] !== undefined && drafts[field] !== site[field]);

  function editDetail(field: DetailField, value: string) {
    setDrafts((current) => ({ ...current, [field]: value }));
    setDetailsStatus(null);
  }

  // Only the fields that changed are sent, so saving one never rewrites another.
  async function submitDetails(event: FormEvent) {
    event.preventDefault();
    setDetailsBusy(true);
    setDetailsStatus(null);
    try {
      await site.saveSettings(Object.fromEntries(changedDetails.map((field) => [field, drafts[field]])));
      setDrafts({});
      setDetailsStatus({ tone: 'saved', message: t('site.titleSaved') });
    } catch (error) {
      setDetailsStatus({ tone: 'error', message: localizedApiError(error, t, 'site.titleUnableSave') });
    } finally {
      setDetailsBusy(false);
    }
  }

  // Saved immediately; the box only changes once the server confirms, so a failed save never looks applied.
  async function setHidden(flag: SiteFlag, hidden: boolean) {
    setHeaderError(null);
    try {
      await site.saveSettings({ [flag]: hidden });
    } catch (error) {
      setHeaderError(localizedApiError(error, t, 'site.headerUnableSave'));
    }
  }

  // The default view is site-wide, so it is saved on the server; this browser's own override is cleared
  // so the administrator immediately sees what a first-time visitor will get.
  async function changeDefaultView(value: string) {
    if (!isSiteView(value)) return;
    setViewError(null);
    try {
      await site.saveSettings({ defaultView: value });
      updatePreferences({ defaultView: null });
    } catch (error) {
      setViewError(localizedApiError(error, t, 'site.viewUnableSave'));
    }
  }

  function reset() {
    const defaults = defaultPreferences();
    updatePreferences({ locale: defaults.locale, theme: defaults.theme, defaultView: defaults.defaultView });
  }

  return (
    <main className="preferencesPage" id="appearance-preferences">
      <header className="adminPageHeader">
        <div><h1>{t('admin.appearanceTitle')}</h1><p>{t('admin.appearanceDescription')}</p></div>
        <button className="button" type="button" onClick={reset}><RotateCcw aria-hidden="true" size={16} />{t('preference.reset')}</button>
      </header>
      <form className="preferencesForm" onSubmit={(event) => void submitDetails(event)}>
        <label>
          <span><strong>{t('site.title')}</strong><small>{t('site.titleHint')}</small></span>
          <input aria-label={t('site.title')} value={detailValue('title')} maxLength={SITE_TITLE_MAX_LENGTH} onChange={(event) => editDetail('title', event.target.value)} />
        </label>
        <label>
          <span><strong>{t('site.description')}</strong><small>{t('site.descriptionHint')}</small></span>
          <input aria-label={t('site.description')} value={detailValue('description')} maxLength={SITE_DESCRIPTION_MAX_LENGTH} onChange={(event) => editDetail('description', event.target.value)} />
        </label>
        <label>
          <span><strong>{t('site.imageUrl')}</strong><small>{t('site.imageUrlHint')}</small></span>
          <input aria-label={t('site.imageUrl')} value={detailValue('imageUrl')} maxLength={SITE_URL_MAX_LENGTH} placeholder="https://example.com/preview.png" onChange={(event) => editDetail('imageUrl', event.target.value)} />
        </label>
        <label>
          <span><strong>{t('site.faviconUrl')}</strong><small>{t('site.faviconUrlHint')}</small></span>
          <input aria-label={t('site.faviconUrl')} value={detailValue('faviconUrl')} maxLength={SITE_URL_MAX_LENGTH} placeholder="https://example.com/favicon.png" onChange={(event) => editDetail('faviconUrl', event.target.value)} />
        </label>
        <div className="preferencesFormActions">
          <button className="button" type="submit" disabled={detailsBusy || changedDetails.length === 0}>{t('site.titleSave')}</button>
          {detailsStatus ? <span className={detailsStatus.tone === 'error' ? 'formError' : 'preferencesSaved'} role={detailsStatus.tone === 'error' ? 'alert' : 'status'}>{detailsStatus.message}</span> : null}
        </div>
      </form>
      <form className="preferencesForm" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span><strong>{t('preference.language')}</strong><small>{t('preference.languageHint')}</small></span>
          <select aria-label={t('preference.language')} value={preferences.locale} onChange={(event) => updatePreferences({ locale: event.target.value as Locale })}>
            <option value="en">English</option>
            <option value="zh-CN">简体中文</option>
          </select>
        </label>
        <label>
          <span><strong>{t('preference.theme')}</strong><small>{t('preference.themeHint')}</small></span>
          <select aria-label={t('preference.theme')} value={preferences.theme} onChange={(event) => updatePreferences({ theme: event.target.value as ThemePreference })}>
            <option value="system">{t('preference.system')}</option>
            <option value="light">{t('preference.light')}</option>
            <option value="dark">{t('preference.dark')}</option>
          </select>
        </label>
        <label>
          <span><strong>{t('preference.defaultView')}</strong><small>{t('preference.defaultViewHint')}</small></span>
          <select aria-label={t('preference.defaultView')} value={site.defaultView} onChange={(event) => void changeDefaultView(event.target.value)}>
            <option value="list">{t('preference.list')}</option>
            <option value="grid">{t('preference.grid')}</option>
          </select>
        </label>
        {viewError ? <p className="formError preferencesFormActions" role="alert">{viewError}</p> : null}
      </form>
      <form className="preferencesForm" aria-label={t('site.headerControls')} onSubmit={(event) => event.preventDefault()}>
        {HEADER_CONTROLS.map(({ flag, label, hint }) => (
          <label key={flag}>
            <span><strong>{t(label)}</strong>{hint ? <small>{t(hint)}</small> : null}</span>
            <input type="checkbox" aria-label={t(label)} checked={site[flag]} onChange={(event) => void setHidden(flag, event.target.checked)} />
          </label>
        ))}
        {headerError ? <p className="formError preferencesFormActions" role="alert">{headerError}</p> : null}
      </form>
    </main>
  );
}
