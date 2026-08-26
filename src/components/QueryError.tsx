/**
 * Inline error state for a failed query.
 *
 * Shows a clear "something went wrong" message with a retry button,
 * so the user can distinguish "you have no data" from "we couldn't
 * load your data." Use this instead of rendering an empty list when
 * a query errors — CLAUDE.md rule 5.
 */
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** What we were trying to load — shown as "Could not load {subject}." */
  subject: string;
  /** Called when the user clicks Retry. Typically queryClient.refetchQueries or refetch(). */
  onRetry?: () => void;
  className?: string;
}

export function QueryError({ subject, onRetry, className }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-8 text-center ${className ?? ''}`}>
      <AlertCircle className="h-8 w-8 text-destructive/60" />
      <p className="text-sm text-muted-foreground">
        Could not load {subject}. Please try again.
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
