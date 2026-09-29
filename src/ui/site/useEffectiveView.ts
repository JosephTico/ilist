import type { ExplorerViewPreference } from '../preferences/preferences';
import { usePreferences } from '../preferences/PreferencesProvider';
import { useSite } from './SiteProvider';

/** The visitor's own view choice when they made one, otherwise the site-wide default. */
export function useEffectiveView(): ExplorerViewPreference {
  const { preferences } = usePreferences();
  const site = useSite();
  return preferences.defaultView ?? site.defaultView;
}
