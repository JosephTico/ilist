import type { Entry } from '../../types/entries';

export type PreviewKind = 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'fallback';

const imageContentTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
const videoContentTypes = new Set(['video/mp4', 'video/webm']);
const audioContentTypes = new Set(['audio/mpeg', 'audio/ogg', 'audio/wav']);
const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);
const markdownExtensions = new Set(['md', 'markdown']);

const textExtensions = new Set([
  'md', 'markdown', 'txt', 'json', 'yaml', 'yml', 'log', 'css', 'js', 'ts', 'tsx', 'jsx', 'html', 'xml',
]);

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLocaleLowerCase() ?? '';
}

/**
 * Whether the browser can safely show this entry as an inline image. Listings from providers such as S3
 * carry no content type, so fall back to the file extension only when the type is unknown; a known
 * non-image type wins because the Worker would serve it as an attachment.
 */
export function isPreviewableImage(entry: Pick<Entry, 'name' | 'contentType'>): boolean {
  const contentType = entry.contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  if (contentType) return imageContentTypes.has(contentType);
  return imageExtensions.has(extensionOf(entry.name));
}

export function isMarkdown(entry: Pick<Entry, 'name' | 'contentType'>): boolean {
  const contentType = entry.contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  return contentType === 'text/markdown' || markdownExtensions.has(extensionOf(entry.name));
}

export function previewKind(entry: Pick<Entry, 'name' | 'contentType'>): PreviewKind {
  const contentType = entry.contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
  if (isPreviewableImage(entry)) return 'image';
  if (videoContentTypes.has(contentType)) return 'video';
  if (audioContentTypes.has(contentType)) return 'audio';
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') return 'text';

  const extension = extensionOf(entry.name);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'svg') return 'fallback';
  if (textExtensions.has(extension)) return 'text';
  return 'fallback';
}
