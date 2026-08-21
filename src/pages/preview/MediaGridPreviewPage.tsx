import { useState } from 'react';
import { Camera, Upload, Download, Trash2 } from 'lucide-react';
import {
  BottomNav,
  Button,
  CLEANER_NAV,
  CardTitle,
  DetailHeader,
  Lightbox,
  MediaGrid,
  type MediaItem,
} from '@/components/portal-v2';

/**
 * MediaGrid + MediaTile + Lightbox — the three media screens' shared parts.
 *
 * Preview route only; static data, replaces nothing live. Images are inline
 * SVG data URIs so the page makes no network requests and the failure tile is
 * reproducible rather than dependent on a flaky host. See §11 of
 * docs/mobile-design-spec.md.
 */

type Load = 'ready' | 'loading' | 'empty' | 'error';

/* Deterministic placeholder — no network, no external host. */
const swatch = (hue: number, label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
       <rect width="400" height="400" fill="hsl(${hue} 30% 62%)"/>
       <text x="50%" y="52%" font-family="system-ui" font-size="34" fill="white"
             text-anchor="middle" opacity="0.9">${label}</text>
     </svg>`,
  )}`;

const BEFORE_AFTER: MediaItem[] = [
  { id: 'b1', src: swatch(20, 'Kitchen'), alt: 'Kitchen before', badge: 'Before', caption: 'Kitchen' },
  { id: 'a1', src: swatch(150, 'Kitchen'), alt: 'Kitchen after', badge: 'After', caption: 'Kitchen' },
  { id: 'b2', src: swatch(20, 'Bath'), alt: 'Bathroom before', badge: 'Before', caption: 'Bathroom' },
  { id: 'a2', src: swatch(150, 'Bath'), alt: 'Bathroom after', badge: 'After', caption: 'Bathroom' },
  /* Deliberately unresolvable — this is the per-tile failure state. */
  { id: 'x1', src: '/__preview_missing_photo.jpg', alt: 'Living room after', badge: 'After', caption: 'Living room' },
];

const JOURNAL: MediaItem[] = [
  { id: 'j1', src: swatch(210, 'Aug 16'), alt: 'Visit Aug 16', caption: 'Aug 16' },
  { id: 'j2', src: swatch(260, 'Aug 02'), alt: 'Visit Aug 2', caption: 'Aug 2' },
  { id: 'j3', src: swatch(300, 'Jul 19'), alt: 'Visit Jul 19', caption: 'Jul 19' },
];

export default function MediaGridPreviewPage() {
  const [state, setState] = useState<Load>('ready');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MediaItem[]>(BEFORE_AFTER);
  const [index, setIndex] = useState(0);

  const openAt = (list: MediaItem[]) => (i: number) => {
    setItems(list);
    setIndex(i);
    setOpen(true);
  };

  return (
    <main className="portal-v2 flex min-h-dvh flex-col bg-[hsl(var(--pv-bg))]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-sunken))] px-5 py-2">
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
          Grid state
        </span>
        {(['ready', 'loading', 'empty', 'error'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            aria-pressed={state === s}
            className={
              state === s
                ? 'rounded-full bg-[hsl(var(--pv-brand))] px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-brand-ink))]'
                : 'rounded-full px-2.5 py-1 text-[10.5px] font-bold text-[hsl(var(--pv-ink-3))]'
            }
          >
            {s}
          </button>
        ))}
      </div>

      <DetailHeader title="Booking Media" sub="Uploads from cleaners" />

        {/* 6f's summary. "0 videos" is a real zero — nobody has uploaded one —
            not a count that failed to read, so it renders as 0 rather than a
            dash, and the caption says the split is of what exists. */}
        <div className="px-5 pt-3">
          <div className="rounded-[14px] border border-[hsl(var(--pv-border))] bg-[hsl(var(--pv-surface))] px-[18px] py-3.5">
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[hsl(var(--pv-ink-3))]">
              Uploads from cleaners
            </p>
            <p className="mt-1 text-[24px] font-extrabold leading-none tabular-nums text-[hsl(var(--pv-ink))]">
              {state === 'error' ? '—' : '117'}
            </p>
            <p className="mt-1 text-[10.5px] font-medium text-[hsl(var(--pv-ink-3))]">
              {state === 'error'
                ? 'before, after and video'
                : '45 before · 72 after · 0 videos'}
            </p>
          </div>
        </div>

      <div className="flex flex-1 flex-col gap-4 px-5 pb-6">
        <section>
          <CardTitle>Staff photos — capture &amp; upload</CardTitle>
          <p className="mb-2 mt-0.5 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            Actions are the caller&rsquo;s. The last tile fails on purpose.
          </p>
          <MediaGrid
            items={BEFORE_AFTER}
            state={state}
            onOpen={openAt(BEFORE_AFTER)}
            onRetry={() => setState('ready')}
            emptyTitle="No photos for this job yet"
            emptyHint="Take a before shot when you arrive."
            actions={
              <>
                <Button variant="primary" icon={<Camera className="h-4 w-4" aria-hidden />}>
                  Take photo
                </Button>
                <Button variant="secondary" icon={<Upload className="h-4 w-4" aria-hidden />}>
                  Upload
                </Button>
              </>
            }
          />
        </section>

        <section>
          <CardTitle>Booking photos — admin review</CardTitle>
          <p className="mb-2 mt-0.5 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            Same grid, different actions. Pairing is a separate layout.
          </p>
          <MediaGrid
            items={BEFORE_AFTER.slice(0, 4)}
            state={state}
            columns={3}
            onOpen={openAt(BEFORE_AFTER.slice(0, 4))}
            onRetry={() => setState('ready')}
            emptyTitle="No photos on this booking"
            actions={
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />}>
                  Download all
                </Button>
                <Button variant="secondary" icon={<Trash2 className="h-4 w-4" aria-hidden />}>
                  Delete
                </Button>
              </>
            }
          />
        </section>

        <section>
          <CardTitle>Client journal — view only</CardTitle>
          <p className="mb-2 mt-0.5 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            No actions, no badges. The same component with props left off.
          </p>
          <MediaGrid
            items={JOURNAL}
            state={state}
            onOpen={openAt(JOURNAL)}
            onRetry={() => setState('ready')}
            emptyTitle="No photos yet"
            emptyHint="Your cleaner's before and after shots appear here."
          />
        </section>
      </div>

      <Lightbox
        open={open}
        items={items}
        index={index}
        onIndex={setIndex}
        onClose={() => setOpen(false)}
      />

      <BottomNav items={CLEANER_NAV} active="docs" />
    </main>
  );
}
