import { useState } from 'react';
import { fileUrl } from '../../api/entries';
import type { Entry } from '../../types/entries';
import { isPreviewableImage } from '../preview/preview-kind';
import { FileIcon } from './FileIcon';

export type FileUrlFor = (entry: Entry, download: boolean, exportFormat?: string) => string;

/** URL of the image to show for an entry: the real file for images, a folder's `folder.png` for folders. */
export function entryThumbnailSrc(entry: Entry, fileUrlFor: FileUrlFor): string | null {
  if (entry.kind === 'folder') return entry.iconFileId ? fileUrl({ id: entry.iconFileId, name: 'folder.png' }) : null;
  return entry.capabilities.download && isPreviewableImage(entry) ? fileUrlFor(entry, false) : null;
}

/** One folder shape for every folder; a folder.png sits inside it so "folder with an icon" reads differently from an image file. */
function FolderGlyph({ iconSrc, onIconError }: { iconSrc: string | null; onIconError: () => void }) {
  return (
    <span className="folderGlyph">
      <svg className="folderGlyphShape" viewBox="0 0 96 80" aria-hidden="true" focusable="false">
        <path className="folderBack" d="M6 14a6 6 0 0 1 6-6h19.6a6 6 0 0 1 4.6 2.1l4.4 5.3a3 3 0 0 0 2.3 1.1H84a6 6 0 0 1 6 6V68a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" />
        <path className="folderFront" d="M6 30a6 6 0 0 1 6-6h72a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6z" />
      </svg>
      {iconSrc ? <img className="folderGlyphImage" src={iconSrc} alt="" loading="lazy" decoding="async" onError={onIconError} /> : null}
    </span>
  );
}

/**
 * What represents an entry visually, in grid cards and list rows alike: the folder shape (with its folder.png
 * inside), the real image, or a plain file icon. A failed image quietly falls back to the icon.
 */
export function EntryVisual({ entry, src, variant }: { entry: Entry; src: string | null; variant: 'grid' | 'row' }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;
  if (entry.kind === 'folder') return <FolderGlyph iconSrc={showImage ? src : null} onIconError={() => setFailedSrc(src)} />;
  if (showImage) {
    return <img className={variant === 'grid' ? 'gridThumbnail' : 'entryThumbnail'} src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />;
  }
  return (
    <span className={`${variant === 'grid' ? 'gridIcon' : 'entryIcon'} ${entry.kind}`}>
      <FileIcon entry={entry} size={variant === 'grid' ? 34 : 22} />
    </span>
  );
}
