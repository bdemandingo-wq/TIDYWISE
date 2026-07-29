import { formatInOrgTime } from "@/components/admin/campaigns/campaignRunStatus";

/**
 * Response shape from `run-inactive-campaign`, and how to describe it honestly
 * in a toast.
 *
 * This function used to send SMS synchronously in a loop and return
 * `{ sentCount }`. It is being changed to enqueue onto the `campaign_sms`
 * PGMQ queue and return `{ runId, totalRecipients }`, with delivery handled
 * over minutes or hours by `process-campaign-queue` at the configured
 * throttle.
 *
 * Both shapes are handled deliberately. This file ships BEFORE the edge
 * function changes, so that there is never a window where the UI reports
 * "Sent 0 messages" while a few hundred recipients are sitting queued. A
 * confidently wrong number is worse than a vague one — it is the difference
 * between an operator waiting and an operator re-sending.
 */

export interface CampaignDispatchResult {
  /** New (queued) shape. */
  runId?: string;
  totalRecipients?: number;
  /** ISO instant the run is scheduled for. Null/absent means "send now". */
  scheduledAt?: string | null;
  /** Legacy (synchronous) shape — remove once the enqueue refactor is live. */
  sentCount?: number;
}

export interface CampaignDispatchToast {
  title: string;
  description: string;
}

export interface DescribeOptions {
  /** IANA zone from business_settings.timezone, so a scheduled time is unambiguous. */
  orgTimezone?: string | null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeCampaignDispatch(
  data: CampaignDispatchResult | null | undefined,
  options: DescribeOptions = {},
): CampaignDispatchToast {
  // Queued path — the run is scheduled, not finished. Say so.
  if (data?.runId) {
    const total = data.totalRecipients ?? 0;
    if (total === 0) {
      return {
        title: "No recipients matched",
        description: "Nothing was queued — no customers matched this audience.",
      };
    }
    // A scheduled run must name its send time. Saying "starts now" for a run
    // that fires hours later contradicts the review screen the operator just
    // confirmed, and is how a send gets triggered twice.
    const scheduled = data.scheduledAt ? new Date(data.scheduledAt) : null;
    if (scheduled && !Number.isNaN(scheduled.getTime()) && scheduled.getTime() > Date.now()) {
      return {
        title: "Campaign scheduled",
        description: `${plural(total, "message")} queued. Sending starts ${formatInOrgTime(data.scheduledAt as string, options.orgTimezone)} and continues at your configured pace.`,
      };
    }
    return {
      title: "Campaign queued",
      description: `${plural(total, "message")} queued. Sending starts now and continues at your configured pace.`,
    };
  }

  // Legacy synchronous path.
  if (typeof data?.sentCount === "number") {
    return {
      title: "Campaign sent",
      description: `${plural(data.sentCount, "message")} sent`,
    };
  }

  // Neither shape. Never claim a number we do not have.
  return {
    title: "Campaign started",
    description: "Check the campaign's status for delivery progress.",
  };
}
