import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

/** "one every 60 seconds" / "one every 5 minutes" — reads the way people say it. */
export function describeThrottle(seconds: number): string {
  if (seconds < 60) return `one every ${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return `one every ${minutes === 1 ? "minute" : `${minutes} minutes`}`;
}

/** Rough wall-clock for the whole send, so a long campaign announces itself. */
export function describeDuration(recipients: number, throttleSeconds: number): string | null {
  if (recipients <= 1) return null;
  const totalMinutes = Math.round(((recipients - 1) * throttleSeconds) / 60);
  if (totalMinutes < 1) return "under a minute";
  if (totalMinutes < 60) return `about ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const h = `${hours} hour${hours === 1 ? "" : "s"}`;
  return minutes === 0 ? `about ${h}` : `about ${h} ${minutes} min`;
}

/**
 * Confirmation before a campaign sends to its whole audience.
 *
 * The send button used to fire on one click with no count and no confirmation.
 * On 2026-07-28 that put real SMS in front of 145 customers by accident. The
 * recipient count is the fact that prevents it, so the dialog does not offer
 * Send until it knows the number — confirming blind is the thing being fixed.
 *
 * The preview uses testMode against the same function and the same body as the
 * real send, so the number shown is the number that will be messaged.
 */
export function CampaignSendConfirmDialog({
  campaign,
  orgId,
  onConfirm,
  onClose,
}: {
  campaign: { id: string; name: string; throttle_seconds?: number | null } | null;
  orgId: string | null;
  onConfirm: (campaignId: string) => void;
  onClose: () => void;
}) {
  const throttleSeconds = campaign?.throttle_seconds ?? 60;

  const { data: preview, isPending, isError, error } = useQuery({
    queryKey: ["campaign-send-preview", orgId, campaign?.id],
    queryFn: async () => {
      const { data, error: fnError } = await supabase.functions.invoke("run-inactive-campaign", {
        body: { organizationId: orgId, campaignId: campaign!.id, testMode: true },
      });
      if (fnError) throw fnError;
      return { count: (data?.toContactCount as number) ?? 0 };
    },
    enabled: !!campaign && !!orgId,
    // Never serve a cached audience size for a destructive confirmation.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const count = preview?.count ?? 0;
  const duration = describeDuration(count, throttleSeconds);
  const canSend = !isPending && !isError && count > 0;

  return (
    <AlertDialog open={!!campaign} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isPending && "Checking who this will reach…"}
            {isError && "Could not check the audience"}
            {!isPending && !isError && count === 0 && "Nobody matches this audience"}
            {canSend && `Send to ${count} recipient${count === 1 ? "" : "s"}, ${describeThrottle(throttleSeconds)}?`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {isPending && (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                  Counting recipients for "{campaign?.name}".
                </span>
              )}

              {isError && (
                <span className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {(error as Error)?.message || "The audience could not be counted."} Nothing has been sent.
                </span>
              )}

              {!isPending && !isError && count === 0 && (
                <span>No customers match this campaign's audience right now, so there is nothing to send.</span>
              )}

              {canSend && (
                <>
                  <span className="block">
                    This sends a real SMS to {count} customer{count === 1 ? "" : "s"} from "{campaign?.name}".
                    {duration && ` Sending takes ${duration}.`}
                  </span>
                  <span className="block text-muted-foreground">
                    You can pause or cancel it once it starts. Anyone who has opted out is skipped automatically.
                  </span>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{canSend ? "Don't send" : "Close"}</AlertDialogCancel>
          {canSend && (
            <AlertDialogAction onClick={() => onConfirm(campaign!.id)}>
              Send to {count}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
