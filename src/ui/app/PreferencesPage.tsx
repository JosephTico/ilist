import { RotateCcw } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { isSiteView, SITE_TITLE_MAX_LENGTH } from '../api/site';
import { useI18n } from '../i18n/I18nProvider';
import { localizedApiError } from '../i18n/apiErrors';
import { defaultPreferences, type Locale, type ThemePreference } from '../preferences/preferences';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useSite } from '../site/SiteProvider';

export function PreferencesPage() {
  const { t } = useI18n();
  const { preferences, updatePreferences } = usePreferences();
  const site = useSite();
  const [draft, setDraft] = useState<string | null>(null);
  const [titleStatus, setTitleStatus] = useState<{ tone: 'saved' | 'error'; message: string } | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const titleValue = draft ?? site.title;

  async function submitTitle(event: FormEvent) {
    event.preventDefault();
    setTitleBusy(true);
    setTitleStatus(null);
    try {
      await site.saveSettings({ title: titleValue });
      setDraft(null);
      setTitleStatus({ tone: 'saved', message: t('site.titleSaved') });
    } catch (error) {
      setTitleStatus({ tone: 'error', message: localizedApiError(error, t, 'site.titleUnableSave') });
    } finally {
      setTitleBusy(false);
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
      <form className="preferencesForm" onSubmit={(event) => void submitTitle(event)}>
        <label>
          <span><strong>{t('site.title')}</strong><small>{t('site.titleHint')}</small></span>
          <input
            aria-label={t('site.title')}
            value={titleValue}
            maxLength={SITE_TITLE_MAX_LENGTH}
            onChange={(event) => { setDraft(event.target.value); setTitleStatus(null); }}
          />
        </label>
        <div className="preferencesFormActions">
          <button className="button" type="submit" disabled={titleBusy || titleValue === site.title}>{t('site.titleSave')}</button>
          {titleStatus ? <span className={titleStatus.tone === 'error' ? 'formError' : 'preferencesSaved'} role={titleStatus.tone === 'error' ? 'alert' : 'status'}>{titleStatus.message}</span> : null}
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
    </main>
  );
}
