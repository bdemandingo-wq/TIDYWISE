import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  isRunActive,
  type CampaignRun,
  type CancelReason,
  type RunAction,
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

/** The status each control writes. Kept next to the actions it mirrors. */
const ACTION_STATUS: Record<RunAction, RunStatus> = {
  pause: "paused",
  resume: "running",
  cancel: "cancelled",
};

const ACTION_PAST_TENSE: Record<RunAction, string> = {
  pause: "Campaign paused",
  resume: "Campaign resumed",
  cancel: "Campaign cancelled",
};

/**
 * Pause, resume and cancel, via the set_campaign_run_status RPC.
 *
 * The RPC is the only sanctioned way to change run state — `authenticated`
 * has SELECT but no UPDATE on campaign_runs — and it authorises the caller
 * internally and rejects illegal transitions. So its errors are meaningful:
 * they are surfaced verbatim rather than replaced with a generic failure
 * message. A non-admin needs to learn they were refused, not that something
 * broke.
 *
 * The RPC returns the updated row, so the cache is written directly instead
 * of invalidated. The UI settles on the same tick rather than flickering
 * through a refetch.
 */
export function useCampaignRunAction(orgId: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ runId, action }: { runId: string; action: RunAction }) => {
      const { data, error } = await supabase.rpc("set_campaign_run_status", {
        p_run_id: runId,
        p_status: ACTION_STATUS[action],
      });
      if (error) throw error;
      return { row: data as unknown as Record<string, unknown> | null, action };
    },
    onSuccess: ({ row, action }) => {
      if (row && typeof row.campaign_id === "string") {
        queryClient.setQueryData<Record<string, CampaignRun>>(
          ["campaign-runs", orgId],
          (prev) => ({
            ...(prev ?? {}),
            [row.campaign_id as string]: {
              id: row.id as string,
              status: row.status as RunStatus,
              cancel_reason: (row.cancel_reason as CancelReason | null) ?? null,
              scheduled_at: (row.scheduled_at as string | null) ?? null,
              total_recipients: (row.total_recipients as number) ?? 0,
              sent_count: (row.sent_count as number) ?? 0,
              failed_count: (row.failed_count as number) ?? 0,
              skipped_opted_out_count: (row.skipped_opted_out_count as number) ?? 0,
            },
          }),
        );
      } else {
        // Shouldn't happen, but never leave the UI showing the old state.
        queryClient.invalidateQueries({ queryKey: ["campaign-runs", orgId] });
      }
      toast({ title: ACTION_PAST_TENSE[action] });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not update this campaign",
        // Verbatim: the RPC says whether it was a permissions refusal or an
        // illegal transition, and the operator needs to know which.
        description: error.message,
        variant: "destructive",
      }),
  });
}
