import { cn } from '@/lib/utils';

/**
 * The only chart primitive in the design system, and deliberately the only one.
 *
 * I counted SVG/path primitives across all 76 comps: exactly two contain any.
 * `5r` platform analytics has this one ("Signups over time"), and `1a` has a
 * smaller version of the same thing. `9b`, despite being titled "performance
 * analytics", has no chart at all — four stat cards and a plain table. So the
 * charting requirement for this whole design system is one line, not a library.
 *
 * ── Why it takes `points: number[] | null` ────────────────────────────────
 *
 * §5.1 applies to charts more sharply than to text. A line chart drawn from
 * zeroes is not an empty state — it is a *flat line at the bottom*, which
 * reads as a real and catastrophic measurement rather than a failed read. It
 * is the chart equivalent of rendering $0.00 on error.
 *
 * `null` therefore means "cannot draw" and renders the labelled empty frame,
 * never a baseline. An explicitly-empty series (`[]`) is the same case: there
 * is no line to draw and pretending otherwise invents a trend.
 *
 * A single point is also refused. Two points make a line; one point makes a
 * dot that the eye reads as a trend line at whatever height it lands.
 */
export function Sparkline({
  points,
  label,
  caption,
  tone = 'brand',
  className,
  height = 56,
}: {
  /** null when the read failed or is still pending. Never pass zeroes for those. */
  points: number[] | null;
  /** Accessible name — this is a graphic, so it needs one. */
  label: string;
  /** Shown inside the frame when there is nothing to draw. */
  caption?: string;
  tone?: 'brand' | 'success';
  className?: string;
  height?: number;
}) {
  const stroke =
    tone === 'success' ? 'hsl(var(--pv-success))' : 'hsl(var(--pv-brand))';

  if (!points || points.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${label}: not available`}
        style={{ height }}
        className={cn(
          'flex items-center justify-center rounded-[10px] bg-[hsl(var(--pv-sunken))] px-3',
          className,
        )}
      >
        <p className="text-[11px] font-semibold text-[hsl(var(--pv-ink-3))]">
          {caption ?? 'No trend to show'}
        </p>
      </div>
    );
  }

  /* viewBox units, not px — the SVG scales to its container and the stroke is
     kept non-scaling so it stays 2px at any width. */
  const W = 100;
  const H = 32;
  const PAD = 2;
  const min = Math.min(...points);
  const max = Math.max(...points);
  /* A flat series is legitimate here (it means the number genuinely did not
     move), unlike a failed read. Draw it down the middle rather than dividing
     by a zero range and pinning it to the top. */
  const span = max - min || 1;
  const flat = max === min;
  const stepX = W / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = flat
      ? H / 2
      : H - PAD - ((v - min) / span) * (H - PAD * 2);
    return [x, y] as const;
  });

  const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} ${W},${H} 0,${H}`;
  const [lastX, lastY] = coords[coords.length - 1];
  const gid = `spark-${tone}`;

  return (
    <div style={{ height }} className={cn('w-full', className)}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gid})`} />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* The head of the line — the comp marks where the series ends. */}
        <circle
          cx={lastX}
          cy={lastY}
          r="2.5"
          fill={stroke}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
