import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { relativeFileUrl } from '../../src/ui/api/entries';
import { AppProviders } from '../../src/ui/app/AppProviders';
import { FileGrid } from '../../src/ui/features/explorer/FileGrid';
import { PreviewOverlay } from '../../src/ui/features/preview/PreviewOverlay';
import { isMarkdown, isPreviewableImage, previewKind } from '../../src/ui/features/preview/preview-kind';
import type { Entry } from '../../src/ui/types/entries';

const capabilities = {
  open: false, preview: true, download: true, upload: false, createFolder: false, rename: false, move: false,
  copy: false, delete: false, changeVisibility: false,
};

function entry(overrides: Partial<Entry> & Pick<Entry, 'id' | 'name'>): Entry {
  return {
    parentId: 'root', kind: 'file', size: 10, contentType: null, updatedAt: '2026-07-15T00:00:00.000Z',
    isPublic: true, effectivePublic: true, sortOrder: 0, description: '', mountPath: null, capabilities,
    ...overrides,
  };
}

const handlers = { onOpen: vi.fn(), onPreview: vi.fn(), onToggle: vi.fn(), onMenu: vi.fn() };

beforeAll(async () => {
  // PreviewOverlay lazy-loads the renderer; transform it once up front so tests are not timing the cold import.
  await import('../../src/ui/features/preview/MarkdownPreview');
}, 30_000);

function renderGrid(entries: Entry[]) {
  return render(
    <AppProviders>
      <FileGrid entries={entries} selectedIds={new Set()} admin={false} handlers={handlers} />
    </AppProviders>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('image detection', () => {
  it('uses the extension only when the content type is unknown', () => {
    expect(isPreviewableImage(entry({ id: 'a', name: 'Card.PNG' }))).toBe(true);
    expect(isPreviewableImage(entry({ id: 'a', name: 'card.webp', contentType: null }))).toBe(true);
    expect(isPreviewableImage(entry({ id: 'a', name: 'card.png', contentType: 'application/octet-stream' }))).toBe(false);
    expect(isPreviewableImage(entry({ id: 'a', name: 'logo.svg' }))).toBe(false);
    expect(isPreviewableImage(entry({ id: 'a', name: 'notes.txt' }))).toBe(false);
    expect(previewKind(entry({ id: 'a', name: 'card.jpeg' }))).toBe('image');
  });

  it('recognises Markdown by type or extension', () => {
    expect(isMarkdown(entry({ id: 'a', name: 'README.md' }))).toBe(true);
    expect(isMarkdown(entry({ id: 'a', name: 'notes.markdown' }))).toBe(true);
    expect(isMarkdown(entry({ id: 'a', name: 'notes', contentType: 'text/markdown; charset=utf-8' }))).toBe(true);
    expect(isMarkdown(entry({ id: 'a', name: 'notes.txt', contentType: 'text/plain' }))).toBe(false);
  });
});

describe('grid thumbnails', () => {
  it('loads the real image lazily for image files even when the listing has no content type', () => {
    const { container } = renderGrid([entry({ id: 'ext_card', name: 'A1 001.png' })]);

    const image = container.querySelector('img.gridThumbnail');
    expect(image).toHaveAttribute('src', '/file/ext_card/A1%20001.png');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('keeps icons for non-images and for files the viewer cannot download', () => {
    const { container } = renderGrid([
      entry({ id: 'doc', name: 'report.pdf', contentType: 'application/pdf' }),
      entry({ id: 'locked', name: 'secret.png', capabilities: { ...capabilities, download: false } }),
    ]);

    expect(container.querySelector('img')).toBeNull();
  });

  it('shows a folder.png as the folder icon only for folders that have one', () => {
    const { container } = renderGrid([
      entry({ id: 'folder-a', name: 'Has icon', kind: 'folder', iconFileId: 'ext_icon' }),
      entry({ id: 'folder-b', name: 'Plain', kind: 'folder' }),
    ]);

    const images = container.querySelectorAll('img.gridThumbnail');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/file/ext_icon/folder.png');
  });

  it('falls back to the icon when the image fails to load', () => {
    const { container } = renderGrid([entry({ id: 'broken', name: 'broken.png' })]);

    fireEvent.error(container.querySelector('img.gridThumbnail')!);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.gridIcon')).not.toBeNull();
  });
});

describe('Markdown preview', () => {
  function stubMarkdown(text: string) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(text, { status: 206 })));
  }
  const readme = entry({ id: 'ext_readme', name: 'README.md', contentType: 'text/markdown' });
  // The provider keeps `t` stable, as in the app; without it the preview's fetch effect restarts on every render.
  function renderPreview(target: Entry, resolveRelativeUrl?: (entry: Entry, path: string) => string) {
    return render(<AppProviders><PreviewOverlay entry={target} onClose={() => undefined} resolveRelativeUrl={resolveRelativeUrl} /></AppProviders>);
  }

  it('renders Markdown by default and toggles to the raw source and back', async () => {
    stubMarkdown('# Title\n\nSome **bold** text');
    renderPreview(readme);

    expect(await screen.findByRole('heading', { name: 'Title' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rendered' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.getByText(/# Title/)).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Title' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Rendered' }));
    expect(await screen.findByRole('heading', { name: 'Title' })).toBeVisible();
  });

  it('resolves relative images and links through the storage, leaving absolute URLs alone', async () => {
    stubMarkdown([
      '![Card](img/my%20pic.png)',
      '![Above](../up.png)',
      '![Remote](https://cdn.example.test/r.png)',
      '[Next](other.md#part)',
      '[Site](https://example.test/)',
    ].join('\n\n'));
    renderPreview(readme, relativeFileUrl);

    expect(await screen.findByRole('img', { name: 'Card' })).toHaveAttribute('src', '/file/ext_readme/README.md?rel=img%2Fmy%20pic.png');
    expect(screen.getByRole('img', { name: 'Above' })).toHaveAttribute('src', '/file/ext_readme/README.md?rel=..%2Fup.png');
    expect(screen.getByRole('img', { name: 'Remote' })).toHaveAttribute('src', 'https://cdn.example.test/r.png');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/file/ext_readme/README.md?rel=other.md#part');
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('href', 'https://example.test/');
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('never requests unresolved relative images from the app origin', async () => {
    stubMarkdown('![Local diagram](diagram.png)');
    const { container } = renderPreview(readme);

    expect(await screen.findByText('Local diagram')).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not render raw HTML or script-scheme links from the document', async () => {
    stubMarkdown('<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
    const { container } = renderPreview(readme, relativeFileUrl);

    await screen.findByText('bad');
    expect(container.querySelector('script, img[onerror]')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('offers no view toggle for other text files', async () => {
    stubMarkdown('plain');
    renderPreview(entry({ id: 'ext_txt', name: 'notes.txt', contentType: 'text/plain' }));

    expect(await screen.findByText('plain')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Source' })).toBeNull();
  });
});
