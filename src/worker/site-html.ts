import type { SiteSettings } from './site-settings';

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Whether the request is a page navigation (as opposed to a script, stylesheet, or other asset). */
export function isDocumentRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (!request.headers.get('accept')?.includes('text/html')) return false;
  const lastSegment = new URL(request.url).pathname.split('/').pop() ?? '';
  return !lastSegment.includes('.') || lastSegment === 'index.html';
}

/** Crawlers need absolute URLs, so a site-relative path is resolved against the public origin. */
function absoluteUrl(url: string, origin: string): string {
  return url.startsWith('/') ? `${origin}${url}` : url;
}

export function siteHeadMarkup(settings: SiteSettings, origin: string): string {
  const meta: Array<['name' | 'property', string, string]> = [
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', settings.title],
    ['property', 'og:title', settings.title],
    ['name', 'twitter:card', settings.imageUrl ? 'summary_large_image' : 'summary'],
    ['name', 'twitter:title', settings.title],
  ];
  if (settings.description) {
    meta.push(['name', 'description', settings.description]);
    meta.push(['property', 'og:description', settings.description]);
    meta.push(['name', 'twitter:description', settings.description]);
  }
  if (settings.imageUrl) {
    const image = absoluteUrl(settings.imageUrl, origin);
    meta.push(['property', 'og:image', image]);
    meta.push(['name', 'twitter:image', image]);
  }
  const lines = meta.map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`);
  if (settings.faviconUrl) lines.push(`<link rel="icon" href="${escapeAttribute(absoluteUrl(settings.faviconUrl, origin))}" />`);
  return lines.join('\n    ');
}

/**
 * Writes the site title into `<title>` and adds description, Open Graph, and favicon tags before the HTML reaches
 * the browser or a link-preview crawler. Validators are dropped because the page now depends on the settings.
 */
export function withSiteMetadata(response: Response, settings: SiteSettings, origin: string): Response {
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/html')) return response;
  const rewritten = new HTMLRewriter()
    .on('title', { element(element) { element.setInnerContent(settings.title); } })
    .on('head', { element(element) { element.append(`\n    ${siteHeadMarkup(settings, origin)}\n  `, { html: true }); } })
    .transform(response);
  const headers = new Headers(rewritten.headers);
  for (const header of ['content-length', 'etag', 'last-modified']) headers.delete(header);
  headers.set('cache-control', 'no-cache');
  return new Response(rewritten.body, { status: rewritten.status, statusText: rewritten.statusText, headers });
}
