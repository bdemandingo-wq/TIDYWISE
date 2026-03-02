import { ReactNode, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { hapticImpact } from '@/lib/haptics';

type SwipeAction = {
  label: string;
  onAction: () => void;
  variant?: 'destructive' | 'default';
};

type Props = {
  children: ReactNode;
  rightAction?: SwipeAction;
  className?: string;
};

export function SwipeableRow({ children, rightAction, className }: Props) {
  const startX = useRef<number | null>(null);
  const active = useRef(false);
  const [x, setX] = useState(0);

  const maxReveal = 96;
  const threshold = 56;

  const action = useMemo(() => rightAction, [rightAction]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!action) return;
    active.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!action || !active.current || startX.current == null) return;
    const dx = e.clientX - startX.current;
    const next = Math.max(-maxReveal, Math.min(0, dx));
    setX(next);
  };

  const reset = () => setX(0);

  const onPointerUp = (e: React.PointerEvent) => {
    if (!action || !active.current) return;
    active.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (Math.abs(x) >= threshold) {
      setX(-maxReveal);
      hapticImpact('light');
    } else {
      reset();
    }
    startX.current = null;
  };

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      {action ? (
        <button
          type="button"
          onClick={() => {
            hapticImpact('medium');
            action.onAction();
            reset();
          }}
          className={cn(
            'absolute inset-y-0 right-0 w-24 z-10',
            'flex items-center justify-center text-sm font-semibold',
            action.variant === 'destructive'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-primary text-primary-foreground'
          )}
          aria-label={action.label}
        >
          {action.label}
        </button>
      ) : null}

      <div
        className={cn(
          'relative will-change-transform touch-pan-y',
          'transition-transform duration-200'
        )}
        style={{ transform: `translate3d(${x}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
