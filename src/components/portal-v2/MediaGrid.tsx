import { Card, Skeleton } from './Card';
import { MediaTile } from './MediaTile';

export type MediaItem = {
  id: string;
  src: string;
  alt: string;
  badge?: string;
  caption?: string;
};

/**
 * The grid the three media screens share.
 *
 * WHAT IS ACTUALLY SHARED, having read all three:
 *   the tile      aspect-locked image + loading + per-tile failure
 *   the grid      2 columns at 390px in all three, more above
 *   the lightbox  all three already open a Dialog on tap
 *   before/after  a tile badge; BookingPhotosPage and StaffPhotosTab both
 *                 carry photo_type, the journal does not
 *
 * WHAT IS NOT, and is deliberately left to the caller as `actions`:
 *   upload + capture   StaffPhotosTab only — 63 upload references
 *   download + delete  BookingPhotosPage only — 8 and 8
 *   before/after pairing   BookingPhotosPage only. That is a comparison
 *                 LAYOUT, not a grid, and folding it in here would make the
 *                 shared component carry an admin-only view.
 *
 * §5.1 at grid level is the usual three, and it composes with the per-tile
 * states rather than replacing them: the grid can be `ready` while individual
 * tiles fail, which is the normal case on a weak connection.
 */
export function MediaGrid({
  items,
  state = 'ready',
  columns = 2,
  emptyTitle = 'No photos yet',
  emptyHint,
  errorLabel = "Couldn't load photos",
  onRetry,
  onOpen,
  actions,
  skeletonTiles = 4,
}: {
  items: MediaItem[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  columns?: 2 | 3;
  emptyTitle?: string;
  emptyHint?: string;
  errorLabel?: string;
  onRetry?: () => void;
  onOpen?: (index: number) => void;
  /** Upload, capture, download, delete — whatever this screen owns. */
  actions?: React.ReactNode;
  skeletonTiles?: number;
}) {
  const cols = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';

  if (state === 'loading') {
    return (
      <Card>
        <div className={`grid ${cols} gap-2`}>
          {Array.from({ length: skeletonTiles }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-[10px]" />
          ))}
        </div>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <div role="alert">
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">{errorLabel}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  if (state === 'empty') {
    return (
      <Card>
        <div className="py-4 text-center">
          <p className="text-[13px] font-bold text-[hsl(var(--pv-ink))]">{emptyTitle}</p>
          {emptyHint && (
            <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">{emptyHint}</p>
          )}
        </div>
        {actions && <div className="mt-2 flex gap-2">{actions}</div>}
      </Card>
    );
  }

  return (
    <Card>
      <div className={`grid ${cols} gap-2`}>
        {items.map((it, i) => (
          <MediaTile
            key={it.id}
            src={it.src}
            alt={it.alt}
            badge={it.badge}
            caption={it.caption}
            onClick={onOpen ? () => onOpen(i) : undefined}
          />
        ))}
      </div>
      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </Card>
  );
}
