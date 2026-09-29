import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../../src/ui/app/AppProviders';
import { ExplorerApp } from '../../src/ui/app/ExplorerApp';
import type { Entry } from '../../src/ui/types/entries';

const capabilities = {
  open: true, preview: false, download: false, upload: false, createFolder: false, rename: false, move: false,
  copy: false, delete: false, changeVisibility: false,
};

function mountEntry(id: string, name: string, mountPath: string): Entry {
  return {
    id, parentId: 'virtual-root', name, kind: 'folder', size: 0, contentType: null, updatedAt: '2026-07-15T00:00:00.000Z',
    isPublic: true, effectivePublic: true, sortOrder: 0, description: '', mountPath, capabilities,
  };
}

const virtualRoot = (items: Entry[]) => ({
  ok: true,
  data: {
    current: { ...mountEntry('virtual-root', 'iList', ''), parentId: null, mountPath: null },
    breadcrumbs: [{ id: 'virtual-root', name: 'iList', path: '/' }],
    items,
  },
});

const guestError = { ok: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in' } };

describe('root redirect for a single storage', () => {
  function stubServer(items: Entry[]) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/site') return Response.json({ ok: true, data: { title: 'iList' } });
      if (url.includes('/api/admin/me')) return new Response(JSON.stringify(guestError), { status: 401 });
      if (url.includes('path=%2F&') || url.endsWith('path=%2F')) return Response.json(virtualRoot(items));
      if (url.includes('/api/fs/list')) return Response.json(virtualRoot([]));
      throw new Error(`Unexpected fetch: ${url}`);
    }));
  }

  beforeEach(() => {
    history.replaceState(null, '', '/');
  });

  it('opens the only storage when visiting the root, replacing the history entry', async () => {
    stubServer([mountEntry('mount-a', 'Assets', '/assets')]);
    const historyLength = history.length;

    render(<AppProviders><ExplorerApp /></AppProviders>);

    await waitFor(() => expect(window.location.pathname).toBe('/assets'));
    expect(history.length).toBe(historyLength);
  });

  it('keeps the root when several storages are available', async () => {
    stubServer([mountEntry('mount-a', 'Assets', '/assets'), mountEntry('mount-b', 'Archive', '/archive')]);

    render(<AppProviders><ExplorerApp /></AppProviders>);

    expect(await screen.findByRole('button', { name: 'Open Assets' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open Archive' })).toBeVisible();
    expect(window.location.pathname).toBe('/');
  });

  it('keeps the root when there is no storage at all', async () => {
    stubServer([]);

    render(<AppProviders><ExplorerApp /></AppProviders>);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/fs/list'), expect.anything()));
    expect(window.location.pathname).toBe('/');
  });
});
