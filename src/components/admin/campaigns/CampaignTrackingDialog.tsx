import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCampaignDetailTracking, type CampaignTrackingStat } from "@/hooks/useCampaigns";
import { CampaignRunControls } from "@/components/admin/campaigns/CampaignRunControls";
import type { CampaignRun } from "@/components/admin/campaigns/campaignRunStatus";

/**
 * Booking-link tracking detail for a single campaign: aggregate tiles plus the
 * per-recipient list.
 *
 * Extracted verbatim from CampaignsPage.tsx — markup, classes, copy, badge
 * variants and thresholds are unchanged.
 */
export function CampaignTrackingDialog({
  campaignId,
  campaignName,
  orgId,
  trackingStats,
  run,
  orgTimezone,
  onClose,
}: {
  campaignId: string | null;
  campaignName: string;
  orgId: string | null;
  trackingStats: Record<string, CampaignTrackingStat>;
  run: CampaignRun | null | undefined;
  orgTimezone: string | null;
  onClose: () => void;
}) {
  const { data: detailTracking = [] } = useCampaignDetailTracking(campaignId, orgId);

  const stats = campaignId ? trackingStats[campaignId] : null;
  const sent = stats?.sent || 0;
  const opened = stats?.opened || 0;
  const completed = stats?.completed || 0;
  const abandoned = stats?.abandoned || 0;
  const convRate = sent > 0 ? Math.round((completed / sent) * 100) : 0;

  return (
    <Dialog open={!!campaignId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Campaign Tracking
          </DialogTitle>
          <DialogDescription>
            Booking link tracking for {campaignName || "campaign"}
          </DialogDescription>
        </DialogHeader>

        <CampaignRunControls run={run} orgTimezone={orgTimezone} />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xl font-bold">{sent}</p>
            <p className="text-xs text-muted-foreground">Sent</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xl font-bold text-amber-600">{opened}</p>
            <p className="text-xs text-muted-foreground">Opened</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xl font-bold text-green-600">{completed}</p>
            <p className="text-xs text-muted-foreground">Completed</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xl font-bold text-destructive">{abandoned}</p>
            <p className="text-xs text-muted-foreground">Abandoned</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <p className="text-xl font-bold">{convRate}%</p>
            <p className="text-xs text-muted-foreground">Conversion</p>
          </div>
        </div>

        {/* REMOVED 2026-07-28: "Re-send to N Abandoned" button.
            It computed the abandoned list (link opened, no booking) client-side
            but then called run-inactive-campaign with targetAudience
            "active_clients" and NO recipient list — so the function re-queried
            from scratch and messaged every active client in the org, while the
            toast reported the abandoned count. It also omitted
            excludeAlreadyReceived, so repeat presses re-sent to everyone.
            Deliberately deleted rather than patched: targeted re-send returns
            with the PGMQ campaign queue, which can enqueue an explicit
            recipient list. Do not reinstate this in its old form. */}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Recipients</h4>
          {detailTracking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tracked links for this campaign yet. Include {"{booking_link}"} in your message to enable tracking.
            </p>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {detailTracking.map((track) => {
                const id = track.id as string;
                const openedAt = track.link_opened_at as string | null;
                const completedAt = track.booking_completed_at as string | null;
                return (
                  <div key={id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{(track.customer_name as string) || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {(track.customer_phone as string) || (track.customer_email as string) || ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {openedAt && (
                        <span className="text-xs text-muted-foreground">
                          Opened {formatDistanceToNow(new Date(openedAt), { addSuffix: true })}
                        </span>
                      )}
                      <Badge
                        variant={completedAt ? "default" : openedAt ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {completedAt ? "Completed" : openedAt ? "Abandoned" : "Sent"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
