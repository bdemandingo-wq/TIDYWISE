import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pause, Play, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaignRunAction } from "@/hooks/useCampaignRuns";
import {
  presentRun,
  type CampaignRun,
  type PauseReason,
  type RunAction,
  type RunTone,
} from "./campaignRunStatus";

const DETAIL_CLASS: Record<RunTone, string> = {
  neutral: "text-muted-foreground",
  active: "text-muted-foreground",
  paused: "text-amber-700 dark:text-amber-400",
  success: "text-muted-foreground",
  warning: "text-orange-700 dark:text-orange-400",
  danger: "text-destructive",
};

const ACTION_LABEL: Record<RunAction, string> = {
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel",
};

const ACTION_ICON = { pause: Pause, resume: Play, cancel: X } as const;

/**
 * Run progress, explanation and controls.
 *
 * Buttons are rendered from `presentRun().actions` rather than hand-coded per
 * status, so the status vocabulary stays the single source of truth — adding
 * a state cannot leave a stale button behind.
 *
 * Skipped and failed counts appear only when non-zero. A permanent "0 failed"
 * is noise that trains people to stop reading the row, which is exactly when
 * a real failure gets missed.
 */
export function CampaignRunControls({
  run,
  orgId,
  orgTimezone,
  pauseReason,
  className,
}: {
  run: CampaignRun | null | undefined;
  /** Required: the mutation writes the updated row into this org's cache key. */
  orgId: string | null;
  orgTimezone?: string | null;
  pauseReason?: PauseReason | null;
  className?: string;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const runAction = useCampaignRunAction(orgId);

  const presentation = presentRun(run, { orgTimezone, pauseReason });
  if (!presentation || !run) return null;

  const total = run.total_recipients ?? 0;
  const sent = run.sent_count ?? 0;
  const skipped = run.skipped_opted_out_count ?? 0;
  const failed = run.failed_count ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

  const act = (action: RunAction) => runAction.mutate({ runId: run.id, action });

  return (
    <div className={cn("space-y-2", className)}>
      {presentation.showProgress && total > 0 && (
        <div className="space-y-1.5">
          <Progress value={percent} aria-label={`${sent} of ${total} messages sent`} />
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="font-medium text-foreground">{sent} of {total} sent</span>
            {skipped > 0 && <span>{skipped} skipped — opted out</span>}
            {failed > 0 && <span className="text-destructive">{failed} failed</span>}
          </div>
        </div>
      )}

      {presentation.detail && (
        <p className={cn("text-xs", DETAIL_CLASS[presentation.tone])}>{presentation.detail}</p>
      )}

      {presentation.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {presentation.actions.map((action) => {
            const Icon = ACTION_ICON[action];
            const isCancel = action === "cancel";
            return (
              <Button
                key={action}
                size="sm"
                variant={isCancel ? "outline" : "secondary"}
                className={cn("gap-1.5", isCancel && "text-destructive border-destructive/30 hover:bg-destructive/10")}
                disabled={runAction.isPending}
                onClick={() => (isCancel ? setConfirmingCancel(true) : act(action))}
              >
                {runAction.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                  : <Icon className="w-3.5 h-3.5" />}
                {ACTION_LABEL[action]}
              </Button>
            );
          })}
        </div>
      )}

      {/* Pause and resume are reversible, so they act immediately. Cancel
          drops the queue irrecoverably and says so, with the count already
          sent — "12 have gone out" changes whether you cancel. */}
      <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              Queued messages will be dropped and cannot be recovered.
              {sent > 0 && ` ${sent} of ${total} ${total === 1 ? "message has" : "messages have"} already been sent.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep sending</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => act("cancel")}
            >
              Cancel campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
