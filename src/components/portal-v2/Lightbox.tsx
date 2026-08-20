import { useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Full-screen viewer. All three media screens have a Dialog behind the grid
 * (BookingPhotosPage 9 uses, StaffPhotosTab 8, PortalPhotoJournalTab 5), so the
 * lightbox is the third genuinely shared piece after the tile and the grid.
 *
 * role="dialog" is correct here and safe: index.css clamps [role="dialog"] to
 * the viewport minus safe areas, which is exactly what a full-screen viewer
 * wants (§10.3).
 *
 * One-handed at 390px: close sits top-right, prev/next are full-height edge
 * targets rather than small centred chevrons, so either thumb reaches them.
 */
export function Lightbox({
  open,
  items,
  index,
  onIndex,
  onClose,
}: {
  open: boolean;
  items: { src: string; alt: string; caption?: string; badge?: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, items.length, onIndex, onClose]);

  if (!open || !items[index]) return null;
  const item = items[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      className="fixed inset-0 z-50 flex flex-col bg-[hsl(var(--pv-inverse))]"
    >
      <div className="flex items-center gap-3 px-4 pt-3">
        <p className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-[hsl(var(--pv-on-inverse))]">
          {item.badge ? `${item.badge} · ` : ''}
          {item.caption ?? item.alt}
        </p>
        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-[hsl(var(--pv-on-inverse-muted))]">
          {index + 1}/{items.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--pv-inverse-well))] text-[hsl(var(--pv-on-inverse))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pv-on-inverse))]"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-3">
        <img
          src={item.src}
          alt={item.alt}
          className="max-h-full max-w-full rounded-[10px] object-contain"
        />

        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndex(index - 1)}
            aria-label="Previous"
            className="absolute inset-y-0 left-0 flex w-14 items-center justify-start pl-2 text-[hsl(var(--pv-on-inverse))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--pv-on-inverse))]"
          >
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            type="button"
            onClick={() => onIndex(index + 1)}
            aria-label="Next"
            className="absolute inset-y-0 right-0 flex w-14 items-center justify-end pr-2 text-[hsl(var(--pv-on-inverse))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--pv-on-inverse))]"
          >
            <ChevronRight className="h-7 w-7" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
