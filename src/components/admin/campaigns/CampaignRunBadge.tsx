import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { presentRun, type CampaignRun, type PauseReason, type RunTone } from "./campaignRunStatus";

/** Tone -> badge treatment. The only place run tone becomes colour. */
const TONE_CLASS: Record<RunTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  active: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warning: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
};

/**
 * Compact run-state pill for campaign list rows.
 *
 * Renders nothing when there is no run — the caller keeps showing the
 * campaign's own Draft / Active badge, which is template state rather than
 * run state.
 */
export function CampaignRunBadge({
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
  if (!presentation) return null;

  const isSending = presentation.tone === "active" && presentation.showProgress;

  return (
    <Badge
      variant="outline"
      className={cn("text-xs gap-1.5", TONE_CLASS[presentation.tone], className)}
      title={presentation.detail ?? undefined}
    >
      {isSending && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {presentation.label}
    </Badge>
  );
}
