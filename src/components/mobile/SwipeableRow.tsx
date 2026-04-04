import { ReactNode, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { hapticImpact } from '@/lib/haptics';

type SwipeAction = {
  label: string;
  onAction: () => void;
  variant?: 'destructive' | 'default' | 'muted';
  bgClass?: string;
};

type Props = {
  children: ReactNode;
  rightActions?: SwipeAction[];
  /** @deprecated Use rightActions instead */
  rightAction?: SwipeAction;
  className?: string;
};

export function SwipeableRow({ children, rightActions, rightAction, className }: Props) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const active = useRef(false);
  const swiping = useRef(false);
  const [x, setX] = useState(0);

  const actions = rightActions || (rightAction ? [rightAction] : []);
  const actionWidth = 72;
  const maxReveal = actions.length * actionWidth;
  const threshold = 40;

  const onPointerDown = (e: React.PointerEvent) => {
    if (actions.length === 0) return;
    active.current = true;
    swiping.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (actions.length === 0 || !active.current || startX.current == null || startY.current == null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // Only start swiping if horizontal movement > 10px and dominates vertical
    if (!swiping.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        swiping.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        return;
      }
    }

    const next = Math.max(-maxReveal, Math.min(0, dx));
    setX(next);
  };

  const reset = () => setX(0);

  const onPointerUp = (e: React.PointerEvent) => {
    if (!active.current) return;
    active.current = false;

    if (swiping.current) {
      try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      if (Math.abs(x) >= threshold) {
        setX(-maxReveal);
        hapticImpact('light');
      } else {
        reset();
      }
    }

    swiping.current = false;
    startX.current = null;
    startY.current = null;
  };

  return (
    <div className={cn('relative overflow-hidden rounded-xl', className)}>
      {actions.length > 0 && (
        <div className="absolute inset-y-0 right-0 flex z-10">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                hapticImpact('medium');
                action.onAction();
                reset();
              }}
              className={cn(
                'flex items-center justify-center text-sm font-semibold',
                action.bgClass || (
                  action.variant === 'destructive'
                    ? 'bg-destructive text-destructive-foreground'
                    : action.variant === 'muted'
                      ? 'bg-[#8E8E93] text-white'
                      : 'bg-[#007AFF] text-white'
                )
              )}
              style={{ width: actionWidth }}
              aria-label={action.label}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

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
