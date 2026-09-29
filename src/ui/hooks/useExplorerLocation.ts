import { useCallback, useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function snapshot(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function canonicalPath(path: string): string {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)));
  return segments.length ? `/${segments.join('/')}` : '/';
}

function publish(url: URL, replace = false): void {
  if (replace) history.replaceState(null, '', `${url.pathname}${url.search}`);
  else history.pushState(null, '', `${url.pathname}${url.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useExplorerLocation() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const path = window.location.pathname;
  const previewId = new URL(window.location.href).searchParams.get('preview');
  const openPath = useCallback(
    (nextPath: string, options?: { replace?: boolean }) => publish(new URL(canonicalPath(nextPath), window.location.origin), options?.replace),
    [],
  );
  const openPreview = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('preview', id);
    publish(url);
  }, []);
  const closePreview = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('preview');
    publish(url);
  }, []);
  return { path, previewId, openPath, openPreview, closePreview };
}
