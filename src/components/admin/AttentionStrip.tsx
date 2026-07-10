import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePageBadgeReasons, type BadgeReason } from '@/hooks/useSidebarBadges';

interface AttentionStripProps {
  /** Sidebar nav href, e.g. '/dashboard/staff'. Used to look up breakdown. */
  href: string;
  /** Optional click handler per reason (filter/tab switch). Falls back to noop. */
  onReasonClick?: (reason: BadgeReason) => void;
  /** Optional bulk-clear button rendered on the right. */
  clearAction?: { label: string; onClick: () => void; disabled?: boolean };
  className?: string;
}

/**
 * Explains, at the top of a page, exactly why this page has a sidebar badge.
 * Each reason is clickable to filter/scope the page to the matching items.
 * Hidden entirely when the badge count is zero.
 */
export function AttentionStrip({ href, onReasonClick, clearAction, className }: AttentionStripProps) {
  const reasons = usePageBadgeReasons(href).filter(r => r.count > 0);
  if (reasons.length === 0) return null;
  const total = reasons.reduce((s, r) => s + r.count, 0);
  return (
    <Card className={`mb-4 border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 ${className || ''}`}>
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium">
            {total} item{total === 1 ? '' : 's'} need attention
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map(r => (
            <Button
              key={r.key}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-amber-300 bg-white hover:bg-amber-100 dark:bg-transparent"
              onClick={() => onReasonClick?.(r)}
            >
              <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{r.count}</Badge>
              <span className="text-xs">{r.count === 1 ? r.label : `${r.label}s`}</span>
            </Button>
          ))}
        </div>
        {clearAction && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={clearAction.onClick}
            disabled={clearAction.disabled}
          >
            {clearAction.label}
          </Button>
        )}
      </div>
    </Card>
  );
}
