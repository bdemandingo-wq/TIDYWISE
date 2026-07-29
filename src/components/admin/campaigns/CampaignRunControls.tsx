import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { presentRun, type CampaignRun, type PauseReason, type RunTone } from "./campaignRunStatus";

const DETAIL_CLASS: Record<RunTone, string> = {
  neutral: "text-muted-foreground",
  active: "text-muted-foreground",
  paused: "text-amber-700 dark:text-amber-400",
  success: "text-muted-foreground",
  warning: "text-orange-700 dark:text-orange-400",
  danger: "text-destructive",
};

/**
 * Run progress and explanation.
 *
 * Display only — pause/resume/cancel arrive in 5D and will render from
 * `presentRun().actions`, so the buttons are never hand-coded per state.
 *
 * Skipped and failed counts appear only when non-zero. A permanent
 * "0 failed" is noise that trains people to stop reading the row, which is
 * exactly when a real failure gets missed.
 */
export function CampaignRunControls({
  run,
  orgTimezone,
  pauseReason,
  className,
}: {
  run: CampaignRun | null | undefined;
  orgTimezone?: string | null;
  pauseReason?: PauseReason | null;
  className?: string;
}) {
  const presentation = presentRun(run, { orgTimezone, pauseReason });
  if (!presentation || !run) return null;

  const total = run.total_recipients ?? 0;
  const sent = run.sent_count ?? 0;
  const skipped = run.skipped_opted_out_count ?? 0;
  const failed = run.failed_count ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  return (
    <div className={cn("space-y-2", className)}>
      {presentation.showProgress && total > 0 && (
        <div className="space-y-1.5">
          <Progress
            value={percent}
            aria-label={`${sent} of ${total} messages sent`}
          />
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            // Announce progress changes to screen readers without stealing focus.
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="font-medium text-foreground">
              {sent} of {total} sent
            </span>
            {skipped > 0 && <span>{skipped} skipped — opted out</span>}
            {failed > 0 && <span className="text-destructive">{failed} failed</span>}
          </div>
        </div>
      )}

      {presentation.detail && (
        <p className={cn("text-xs", DETAIL_CLASS[presentation.tone])}>{presentation.detail}</p>
      )}
    </div>
  );
}
