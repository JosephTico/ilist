import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export type ResolveRelativeUrl = (path: string) => string;

interface RelativeReference {
  path: string;
  hash: string;
}

/** Returns null for anchors, absolute URLs, and protocol-relative URLs; those are never rewritten. */
function relativeReference(url: string): RelativeReference | null {
  if (!url || url.startsWith('#') || url.startsWith('//') || URL_SCHEME.test(url)) return null;
  const hashStart = url.indexOf('#');
  const withoutHash = hashStart === -1 ? url : url.slice(0, hashStart);
  const hash = hashStart === -1 ? '' : url.slice(hashStart);
  const queryStart = withoutHash.indexOf('?');
  const rawPath = queryStart === -1 ? withoutHash : withoutHash.slice(0, queryStart);
  try {
    return { path: decodeURIComponent(rawPath), hash };
  } catch {
    return { path: rawPath, hash };
  }
}

function markdownComponents(resolveRelativeUrl: ResolveRelativeUrl | undefined): Components {
  return {
    img({ src, alt, title }) {
      if (typeof src !== 'string' || !src) return <span className="previewMarkdownMissing">{alt}</span>;
      const relative = relativeReference(src);
      const resolved = relative ? resolveRelativeUrl?.(relative.path) : src;
      if (!resolved) return <span className="previewMarkdownMissing">{alt}</span>;
      return <img src={resolved} alt={alt ?? ''} title={title} loading="lazy" decoding="async" referrerPolicy="no-referrer" />;
    },
    a({ href, children, title }) {
      if (typeof href !== 'string' || !href) return <>{children}</>;
      if (href.startsWith('#')) return <a href={href} title={title}>{children}</a>;
      const relative = relativeReference(href);
      const resolved = relative ? (resolveRelativeUrl ? `${resolveRelativeUrl(relative.path)}${relative.hash}` : null) : href;
      if (!resolved) return <>{children}</>;
      return <a href={resolved} title={title} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
  };
}

/**
 * Renders Markdown without raw HTML. Relative image and link targets are resolved through
 * `resolveRelativeUrl` (same-storage files); without it they are shown as plain text.
 */
export function MarkdownPreview({ text, resolveRelativeUrl }: { text: string; resolveRelativeUrl?: ResolveRelativeUrl }) {
  const components = useMemo(() => markdownComponents(resolveRelativeUrl), [resolveRelativeUrl]);
  return (
    <div className="previewMarkdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>{text}</Markdown>
    </div>
  );
}
