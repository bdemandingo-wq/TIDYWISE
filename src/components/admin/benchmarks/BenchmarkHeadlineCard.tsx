import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  yourValue: number | null | undefined;
  peerValue: number | null | undefined;
  format?: 'currency' | 'percent' | 'rating' | 'number';
  /** When true, lower is better (e.g. cancel rate). */
  lowerIsBetter?: boolean;
  helper?: string;
}

function formatValue(v: number | null | undefined, fmt: Props['format']) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  switch (fmt) {
    case 'currency':
      return `$${v.toFixed(0)}`;
    case 'percent':
      return `${(v * 100).toFixed(1)}%`;
    case 'rating':
      return v.toFixed(2);
    default:
      return v.toFixed(1);
  }
}

export function BenchmarkHeadlineCard({
  label,
  yourValue,
  peerValue,
  format = 'number',
  lowerIsBetter = false,
  helper,
}: Props) {
  const hasBoth =
    typeof yourValue === 'number' &&
    !Number.isNaN(yourValue) &&
    typeof peerValue === 'number' &&
    !Number.isNaN(peerValue) &&
    peerValue !== 0;

  let deltaPct: number | null = null;
  let direction: 'up' | 'down' | 'flat' = 'flat';
  let good = false;

  if (hasBoth) {
    deltaPct = ((yourValue! - peerValue!) / Math.abs(peerValue!)) * 100;
    if (Math.abs(deltaPct) < 1) direction = 'flat';
    else if (deltaPct > 0) direction = 'up';
    else direction = 'down';
    good = lowerIsBetter ? (yourValue! < peerValue!) : (yourValue! > peerValue!);
  }

  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;

  return (
    <Card className="p-4 space-y-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold">{formatValue(yourValue, format)}</div>
        {hasBoth && deltaPct !== null && (
          <Badge
            variant="secondary"
            className={cn(
              'gap-1 font-medium',
              direction === 'flat'
                ? 'bg-muted text-muted-foreground'
                : good
                ? 'bg-success/10 text-success'
                : 'bg-warning/10 text-warning',
            )}
          >
            <Icon className="h-3 w-3" />
            {Math.abs(deltaPct).toFixed(0)}%
          </Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        All orgs: <span className="font-medium text-foreground">{formatValue(peerValue, format)}</span>
        {helper ? <> · {helper}</> : null}
      </div>
    </Card>
  );
}
