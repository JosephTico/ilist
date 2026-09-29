import type { PropsWithChildren } from 'react';
import { I18nProvider } from '../i18n/I18nProvider';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { SiteProvider } from '../site/SiteProvider';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <PreferencesProvider>
      <SiteProvider>
        <I18nProvider>{children}</I18nProvider>
      </SiteProvider>
    </PreferencesProvider>
  );
}
