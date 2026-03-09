import { ReactNode, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileCardListProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => ReactNode;
  renderEmpty?: () => ReactNode;
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  estimateSize?: number;
  className?: string;
  skeletonCount?: number;
}

export function MobileCardList<T>({
  items,
  renderCard,
  renderEmpty,
  isLoading = false,
  onRefresh,
  estimateSize = 100,
  className,
  skeletonCount = 6,
}: MobileCardListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const refreshFn = useCallback(async () => {
    if (onRefresh) await onRefresh();
  }, [onRefresh]);

  const { refreshing, pullDistance, handlers } = usePullToRefresh(refreshFn);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  if (isLoading) {
    return (
      <div className={cn('space-y-3 px-1', className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0 && renderEmpty) {
    return <>{renderEmpty()}</>;
  }

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto relative', className)}
      style={{ maxHeight: 'calc(100vh - 220px)' }}
      {...(onRefresh ? handlers : {})}
    >
      {/* Pull-to-refresh indicator */}
      {onRefresh && (pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center transition-all duration-200"
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          <Loader2
            className={cn(
              'w-5 h-5 text-primary transition-transform',
              refreshing && 'animate-spin'
            )}
            style={{
              transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
              opacity: Math.min(pullDistance / 64, 1),
            }}
          />
        </div>
      )}

      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <div className="pb-2">
              {renderCard(items[virtualItem.index], virtualItem.index)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
