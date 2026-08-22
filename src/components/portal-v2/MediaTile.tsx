import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Card';

/**
 * One tile in a media grid.
 *
 * §5.1 APPLIES PER TILE, not just per grid. None of the three live screens
 * handles a failed image load — BookingPhotosPage, StaffPhotosTab and
 * PortalPhotoJournalTab all render a bare <img>, so a photo that 404s or times
 * out shows as a broken-image glyph or an empty square. On a cleaner's phone
 * over a bad connection that is the common case, not the rare one, and an empty
 * square is indistinguishable from "no photo was taken" — which is the same
 * empty-vs-error confusion §5.1 exists for, one level down.
 *
 * So a tile has three visual states of its own: loading, loaded, and failed.
 * Failed says so and offers a retry; it never looks like an absence.
 */
export function MediaTile({
  src,
  alt,
  badge,
  caption,
  onClick,
  className,
}: {
  src: string;
  alt: string;
  /** e.g. Before / After. Optional — the journal has no pairing. */
  badge?: string;
  caption?: string;
  onClick?: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [nonce, setNonce] = useState(0);

  /**
   * Signed URLs arrive a beat after the grid mounts, so a tile's first render
   * often carries src="". An <img> with an empty src fires onError immediately,
   * and without this the tile latched to 'failed' and stayed there even once the
   * real URL arrived — every photo read "Couldn't load". A src change re-arms it.
   */
  useEffect(() => {
    setStatus('loading');
  }, [src]);

  // An empty src is "not resolved yet", not "broken": hold the skeleton.
  const resolved = src.length > 0;



  return (
    <figure className={cn('min-w-0', className)}>
      <div className="relative aspect-square overflow-hidden rounded-[10px] bg-[hsl(var(--pv-sunken))]">
        {status === 'loading' && <Skeleton className="absolute inset-0 rounded-[10px]" />}

        {resolved && status !== 'failed' && (

          <img
            key={nonce}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus('ok')}
            onError={() => setStatus('failed')}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              status === 'ok' ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}

        {status === 'failed' && (
          <div
            role="alert"
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center"
          >
            <ImageOff className="h-5 w-5 text-[hsl(var(--pv-ink-3))]" aria-hidden />
            <span className="text-[10.5px] font-bold text-[hsl(var(--pv-ink-2))]">
              Couldn&rsquo;t load
            </span>
            <button
              type="button"
              onClick={() => {
                setStatus('loading');
                setNonce((n) => n + 1);
              }}
              className="text-[10.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {badge && status === 'ok' && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-[hsl(var(--pv-inverse))] px-2 py-[3px] text-[10px] font-extrabold uppercase tracking-[0.04em] text-[hsl(var(--pv-on-inverse))]">
            {badge}
          </span>
        )}

        {/* The whole tile is the tap target, and only when it can be opened. */}
        {onClick && status === 'ok' && (
          <button
            type="button"
            onClick={onClick}
            aria-label={alt}
            className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--pv-brand))]"
          />
        )}
      </div>

      {caption && (
        <figcaption className="mt-1 truncate text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
