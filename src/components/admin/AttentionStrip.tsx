import { AlertTriangle, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePageBadgeReasons, useSidebarBadgesFull, type BadgeReason } from '@/hooks/useSidebarBadges';
import { useDismissedBadges } from '@/hooks/useDismissedBadges';

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
 * A per-reason ✕ dismisses that reason (mark-as-read) and a "Mark all read"
 * button dismisses every reason on the page. Reasons re-appear when the
 * underlying count grows past the dismissed snapshot.
 * Hidden entirely when the badge count is zero.
 */
export function AttentionStrip({ href, onReasonClick, clearAction, className }: AttentionStripProps) {
  // Pull the full (un-dismissed) reasons for this page so the "Mark all read"
  // snapshot matches what the sidebar sees before dismissal filtering.
  const { breakdowns } = useSidebarBadgesFull();
  const dismissed = useDismissedBadges();
  const reasons = usePageBadgeReasons(href).filter(r => r.count > 0);
  if (reasons.length === 0) return null;
  const total = reasons.reduce((s, r) => s + r.count, 0);
  const label = reasons.length === 1 ? reasons[0].label : 'item';

  const handleDismissOne = (r: BadgeReason) => {
    dismissed.dismiss(href, r.key, r.count);
    toast.success(`Marked ${r.count} ${r.label}${r.count === 1 ? '' : 's'} as read`, {
      action: {
        label: 'Undo',
        onClick: () => {
          // Reset only this key by writing 0 back
          dismissed.dismissAll(href, [{ key: r.key, count: 0 }]);
        },
      },
    });
  };

  const handleMarkAllRead = () => {
    const raw = (breakdowns[href] || []).filter(r => r.count > 0);
    dismissed.dismissAll(href, raw.map(r => ({ key: r.key, count: r.count })));
    toast.success(`Marked ${total} item${total === 1 ? '' : 's'} as read`);
  };

  return (
    <Card className={`mb-4 border-amber-300 bg-amber-50/60 dark:bg-amber-900/10 ${className || ''}`}>
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium">
            {total} {label}{total === 1 ? '' : 's'} need attention
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map(r => (
            <div key={r.key} className="flex items-stretch overflow-hidden rounded-md border border-amber-300 bg-white dark:bg-transparent">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 rounded-none px-2 hover:bg-amber-100"
                onClick={() => onReasonClick?.(r)}
              >
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">{r.count}</Badge>
                <span className="text-xs">{r.count === 1 ? r.label : `${r.label}s`}</span>
              </Button>
              <button
                type="button"
                aria-label={`Mark ${r.label} as read`}
                title="Mark as read"
                className="flex items-center border-l border-amber-300 px-1.5 text-amber-700 hover:bg-amber-100"
                onClick={(e) => { e.stopPropagation(); handleDismissOne(r); }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs"
            onClick={handleMarkAllRead}
            title="Hides these badges until new items appear"
          >
            <Check className="h-3.5 w-3.5" />
            Mark all read
          </Button>
          {clearAction && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={clearAction.onClick}
              disabled={clearAction.disabled}
            >
              {clearAction.label}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
