import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  isRunActive,
  type CampaignRun,
  type CancelReason,
  type RunStatus,
} from "@/components/admin/campaigns/campaignRunStatus";

/** How often to re-read while at least one run can still change on its own. */
const ACTIVE_POLL_MS = 5000;

/**
 * The most recent run for each campaign in the organisation, keyed by
 * campaign_id, so the list can badge every row from a single query.
 *
 * Polls only while something is actually in flight. A page full of finished
 * campaigns must not poll forever — `refetchInterval` returns false once every
 * run has reached a terminal state, and resumes the moment a new one starts.
 */
export function useCampaignRuns(orgId: string | null) {
  return useQuery({
    queryKey: ["campaign-runs", orgId],
    queryFn: async (): Promise<Record<string, CampaignRun>> => {
      if (!orgId) return {};
      const { data, error } = await supabase
        .from("campaign_runs")
        .select(
          "id, campaign_id, status, cancel_reason, scheduled_at, total_recipients, sent_count, failed_count, skipped_opted_out_count, created_at",
        )
        .eq("organization_id", orgId)
        // Newest first, with a unique tiebreaker: created_at alone is not
        // unique, and without one the "most recent" row could differ between
        // reads for runs created in the same instant.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw error;

      const latestByCampaign: Record<string, CampaignRun> = {};
      for (const row of data || []) {
        // Rows arrive newest-first, so the first one seen per campaign wins.
        if (latestByCampaign[row.campaign_id]) continue;
        latestByCampaign[row.campaign_id] = {
          id: row.id,
          status: row.status as RunStatus,
          cancel_reason: (row.cancel_reason as CancelReason | null) ?? null,
          scheduled_at: row.scheduled_at,
          total_recipients: row.total_recipients ?? 0,
          sent_count: row.sent_count ?? 0,
          failed_count: row.failed_count ?? 0,
          skipped_opted_out_count: row.skipped_opted_out_count ?? 0,
        };
      }
      return latestByCampaign;
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      const runs = query.state.data as Record<string, CampaignRun> | undefined;
      if (!runs) return false;
      return Object.values(runs).some(isRunActive) ? ACTIVE_POLL_MS : false;
    },
  });
}
