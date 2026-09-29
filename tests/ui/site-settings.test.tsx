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
const site = (overrides: { title?: string; defaultView?: string } = {}) => ({
  ok: true,
  data: { title: 'iList', defaultView: 'list', ...overrides },
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
    const save = screen.getByRole('button', { name: 'Save title' });
    expect(save).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, '  Card Vault ');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(await screen.findByRole('status')).toHaveTextContent('Title saved.');
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
    await userEvent.click(screen.getByRole('button', { name: 'Save title' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save the site title.');
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
