import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../src/ui/app/AppProviders';
import { ExplorerApp } from '../../src/ui/app/ExplorerApp';
import { PreferencesPage } from '../../src/ui/app/PreferencesPage';
import { AppHeader } from '../../src/ui/components/AppHeader';
import { PREFERENCES_KEY } from '../../src/ui/preferences/preferences';
import type { Entry } from '../../src/ui/types/entries';

const noop = () => undefined;
const site = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  data: {
    title: 'iList', defaultView: 'list', hideGithubLink: false, hideLanguageSelector: false, hideLogin: false, ...overrides,
  },
});

function renderHeader() {
  return render(
    <AppProviders>
      <AppHeader admin={false} onHome={noop} onStorage={noop} onSignIn={noop} onSignOut={noop} />
    </AppProviders>,
  );
}

describe('site title', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('shows the server title in the header and the browser tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(site({ title: 'Card Vault' }))));

    renderHeader();

    expect(await screen.findByText('Card Vault')).toBeVisible();
    await waitFor(() => expect(document.title).toBe('Card Vault'));
  });

  it('starts from the cached settings and keeps them when the server cannot be reached', async () => {
    localStorage.setItem('ilist.ui.siteSettings', JSON.stringify({ title: 'Cached Title', defaultView: 'grid' }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));

    renderHeader();

    expect(screen.getByText('Cached Title')).toBeVisible();
    await waitFor(() => expect(document.title).toBe('Cached Title'));
  });

  it('falls back to iList and ignores malformed responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, data: [{ not: 'a title' }] })));

    renderHeader();

    expect(screen.getByText('iList')).toBeVisible();
    await waitFor(() => expect(document.title).toBe('iList'));
  });

  it('saves a new title from the appearance page and applies it everywhere', async () => {
    const requests: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/site') return Response.json(site());
      if (url === '/api/admin/site' && method === 'PUT') return Response.json(site({ title: 'Card Vault' }));
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    }));
    render(
      <AppProviders>
        <AppHeader admin onHome={noop} onStorage={noop} onSignIn={noop} onSignOut={noop} />
        <PreferencesPage />
      </AppProviders>,
    );
    const input = screen.getByRole('textbox', { name: 'Site title' });
    const save = screen.getByRole('button', { name: 'Save details' });
    expect(save).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, '  Card Vault ');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(await screen.findByRole('status')).toHaveTextContent('Details saved.');
    expect(requests.find((request) => request.method === 'PUT')).toMatchObject({ url: '/api/admin/site', body: { title: '  Card Vault ' } });
    expect(screen.getAllByText('Card Vault').length).toBeGreaterThan(0);
    expect(document.title).toBe('Card Vault');
    expect(input).toHaveValue('Card Vault');
    expect(save).toBeDisabled();
  });

  it('shows a localized error and keeps the draft when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/site') return Response.json(site());
      if (init?.method === 'PUT') return Response.json({ ok: false, error: { code: 'INVALID_SITE_TITLE', message: 'raw server text' } }, { status: 400 });
      throw new Error('Unexpected fetch');
    }));
    render(<AppProviders><PreferencesPage /></AppProviders>);

    await userEvent.type(screen.getByRole('textbox', { name: 'Site title' }), ' Extra');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save the site details.');
    expect(screen.getByRole('textbox', { name: 'Site title' })).toHaveValue('iList Extra');
    expect(document.title).toBe('iList');
  });
});

describe('site default view', () => {
  const capabilities = {
    open: false, preview: true, download: true, upload: false, createFolder: false, rename: false, move: false,
    copy: false, delete: false, changeVisibility: false,
  };
  const file: Entry = {
    id: 'file-1', parentId: 'dir', name: 'a.txt', kind: 'file', size: 3, contentType: 'text/plain', updatedAt: '2026-07-15T00:00:00.000Z',
    isPublic: true, effectivePublic: true, sortOrder: 0, description: '', mountPath: '/assets', capabilities,
  };
  const listing = {
    ok: true,
    data: {
      current: { ...file, id: 'dir', name: 'assets', kind: 'folder', capabilities: { ...capabilities, open: true } },
      breadcrumbs: [{ id: 'virtual-root', name: 'iList', path: '/' }, { id: 'dir', name: 'assets', path: '/assets' }],
      items: [file],
    },
  };

  function stubServer(defaultView: 'list' | 'grid') {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/site') return Response.json(site({ defaultView }));
      if (url.includes('/api/admin/me')) return Response.json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'x' } }, { status: 401 });
      if (url.includes('/api/fs/list')) return Response.json(listing);
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  }

  beforeEach(() => {
    history.replaceState(null, '', '/assets');
  });

  it('gives a first-time visitor the grid the administrator chose, without storing it as their own pick', async () => {
    stubServer('grid');

    const { container } = render(<AppProviders><ExplorerApp /></AppProviders>);

    await waitFor(() => expect(container.querySelector('ul.fileGrid')).not.toBeNull());
    expect(container.querySelector('ul.fileList')).toBeNull();
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).defaultView).toBeNull();
  });

  it('lets a visitor keep their own view over the site default', async () => {
    stubServer('grid');
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, locale: 'en', theme: 'light', defaultView: 'list' }));

    const { container } = render(<AppProviders><ExplorerApp /></AppProviders>);

    await waitFor(() => expect(container.querySelector('ul.fileList')).not.toBeNull());
    expect(container.querySelector('ul.fileGrid')).toBeNull();
  });

  it('saves the site default from the appearance page and clears this browser\'s override', async () => {
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/site') return Response.json(site());
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        return Response.json(site({ defaultView: 'grid' }));
      }
      throw new Error('Unexpected fetch');
    }));
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, locale: 'en', theme: 'light', defaultView: 'list' }));
    render(<AppProviders><PreferencesPage /></AppProviders>);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Default view' }), 'grid');

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Default view' })).toHaveValue('grid'));
    expect(puts).toEqual([{ defaultView: 'grid' }]);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).defaultView).toBeNull());
  });

  it('keeps this browser\'s choice and reports an error when the site default cannot be saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/site') return Response.json(site());
      if (init?.method === 'PUT') return Response.json({ ok: false, error: { code: 'X', message: 'raw' } }, { status: 500 });
      throw new Error('Unexpected fetch');
    }));
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, locale: 'en', theme: 'light', defaultView: 'list' }));
    render(<AppProviders><PreferencesPage /></AppProviders>);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Default view' }), 'grid');

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save the default view.');
    expect(screen.getByRole('combobox', { name: 'Default view' })).toHaveValue('list');
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY)!).defaultView).toBe('list');
  });
});

describe('hidden header controls', () => {
  const GITHUB = { role: 'link', name: 'Open iList on GitHub' } as const;
  const LANGUAGE = { role: 'button', name: 'Change language' } as const;
  const SIGN_IN = { role: 'button', name: 'Admin sign in' } as const;

  function stubSite(overrides: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/site') return Response.json(site(overrides));
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }));
  }

  it('shows every control by default', async () => {
    stubSite({});
    renderHeader();

    expect(await screen.findByRole(GITHUB.role, { name: GITHUB.name })).toBeVisible();
    expect(screen.getByRole(LANGUAGE.role, { name: LANGUAGE.name })).toBeVisible();
    expect(screen.getByRole(SIGN_IN.role, { name: SIGN_IN.name })).toBeVisible();
  });

  it.each([
    ['hideGithubLink', GITHUB],
    ['hideLanguageSelector', LANGUAGE],
    ['hideLogin', SIGN_IN],
  ] as const)('%s hides only its own control', async (flag, hidden) => {
    stubSite({ [flag]: true });
    renderHeader();

    await waitFor(() => expect(screen.queryByRole(hidden.role, { name: hidden.name })).toBeNull());
    for (const control of [GITHUB, LANGUAGE, SIGN_IN]) {
      if (control !== hidden) expect(screen.getByRole(control.role, { name: control.name })).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Change theme' })).toBeVisible();
  });

  it('keeps sign-out and storage settings for a signed-in administrator even when the sign-in button is hidden', async () => {
    stubSite({ hideLogin: true });
    render(
      <AppProviders>
        <AppHeader admin username="admin" onHome={noop} onStorage={noop} onSignIn={noop} onSignOut={noop} />
      </AppProviders>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Storage settings' })).toBeVisible();
    expect(screen.queryByRole(SIGN_IN.role, { name: SIGN_IN.name })).toBeNull();
  });

  it('still opens the sign-in dialog at /admin when the sign-in button is hidden', async () => {
    history.replaceState(null, '', '/admin');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/site') return Response.json(site({ hideLogin: true }));
      if (url.includes('/api/admin/me')) return Response.json({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'x' } }, { status: 401 });
      if (url.includes('/api/fs/list')) return Response.json({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } }, { status: 404 });
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    render(<AppProviders><ExplorerApp /></AppProviders>);

    expect(await screen.findByRole('dialog', { name: 'Admin sign in' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole(SIGN_IN.role, { name: SIGN_IN.name })).toBeNull());
  });

  it('saves a toggle from the appearance page and applies it to the header at once', async () => {
    const puts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/site') return Response.json(site());
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(String(init.body)));
        return Response.json(site({ hideGithubLink: true }));
      }
      throw new Error('Unexpected fetch');
    }));
    render(
      <AppProviders>
        <AppHeader admin={false} onHome={noop} onStorage={noop} onSignIn={noop} onSignOut={noop} />
        <PreferencesPage />
      </AppProviders>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Hide GitHub link' });
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    expect(puts).toEqual([{ hideGithubLink: true }]);
    expect(screen.queryByRole(GITHUB.role, { name: GITHUB.name })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Hide sign-in button' })).not.toBeChecked();
  });

  it('leaves the box and the header unchanged and reports an error when saving fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/site') return Response.json(site());
      if (init?.method === 'PUT') return Response.json({ ok: false, error: { code: 'X', message: 'raw' } }, { status: 500 });
      throw new Error('Unexpected fetch');
    }));
    render(
      <AppProviders>
        <AppHeader admin={false} onHome={noop} onStorage={noop} onSignIn={noop} onSignOut={noop} />
        <PreferencesPage />
      </AppProviders>,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'Hide sign-in button' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save the header settings.');
    expect(screen.getByRole('checkbox', { name: 'Hide sign-in button' })).not.toBeChecked();
    expect(screen.getByRole(SIGN_IN.role, { name: SIGN_IN.name })).toBeVisible();
  });
});
