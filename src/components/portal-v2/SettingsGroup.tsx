import { Card, Skeleton } from './Card';

/**
 * A group of settings rows. The live app already groups this way — SettingsPage
 * uses Card + CardHeader(CardTitle + CardDescription) + CardContent ten times
 * over — so this formalises the shape rather than inventing one.
 *
 * THE §5.1 RULE THAT MATTERS HERE
 * A settings group that failed to load must not render as a group of OFF
 * toggles. That is the same defect as "$0.00 on failure" and worse in one way:
 * a zero at least looks like a number someone might question, whereas a row of
 * off switches looks like a decision the user made. They will turn things back
 * on that were never off, or assume a feature is disabled and stop using it.
 *
 * So `state` is required, and on `error` the rows are NOT RENDERED AT ALL —
 * there is no code path where a failed read produces a control with a default
 * value. The rows are children, and children of an errored group are dropped.
 */
export function SettingsGroup({
  title,
  description,
  state = 'ready',
  errorLabel,
  onRetry,
  skeletonRows = 3,
  footer,
  children,
}: {
  title: string;
  description?: string;
  state?: 'ready' | 'loading' | 'error';
  errorLabel?: string;
  onRetry?: () => void;
  skeletonRows?: number;
  footer?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <h2 className="text-[14px] font-extrabold text-[hsl(var(--pv-ink))]">{title}</h2>
      {description && (
        <p className="mt-1 text-[11.5px] font-normal leading-[1.45] text-[hsl(var(--pv-ink-3))]">
          {description}
        </p>
      )}

      {state === 'loading' && (
        <div className="mt-3 flex flex-col gap-4">
          {Array.from({ length: skeletonRows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="mt-1.5 h-2.5 w-3/4" />
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* No rows. Not one row. A failed read renders no controls at all. */}
      {state === 'error' && (
        <div role="alert" className="mt-3">
          <p className="text-[12.5px] font-semibold text-[hsl(var(--pv-ink-2))]">
            {errorLabel ?? `Couldn't load ${title.toLowerCase()}`}
          </p>
          <p className="mt-1 text-[11.5px] font-normal text-[hsl(var(--pv-ink-3))]">
            Your settings are unchanged.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 text-[11.5px] font-bold text-[hsl(var(--pv-brand))] underline-offset-2 hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="mt-1.5 flex flex-col divide-y divide-[hsl(var(--pv-border))]">
            {children}
          </div>
          {footer && <div className="mt-3">{footer}</div>}
        </>
      )}
    </Card>
  );
}
