/**
 * The vocabulary for campaign run state — label, tone, explanation and the
 * actions offered — as data rather than JSX.
 *
 * Every component that shows run state reads from here, so the taxonomy is
 * defined once. In particular the three cancel reasons stay distinct:
 * "you cancelled this", "this expired before sending" and "this never
 * started" need three different operator responses, and collapsing them to
 * "Cancelled" throws away the only information that tells them apart.
 *
 * Deliberately dependency-free and free of JSX so it can be unit-tested with
 * `node --test` and no DOM.
 */

export type RunStatus = "pending" | "running" | "paused" | "cancelled" | "completed";
export type CancelReason = "user_cancelled" | "expired" | "enqueue_stalled";

/**
 * Why a run is paused. There is no pause_reason column yet — an auto-pause
 * from missing SMS credentials is currently indistinguishable from a user
 * pause in the database. This is the seam: when the column lands, pass it
 * through and the presentation follows, with no other change.
 */
export type PauseReason = "user_paused" | "sms_not_configured";

export type RunTone = "neutral" | "active" | "paused" | "success" | "warning" | "danger";
export type RunAction = "pause" | "resume" | "cancel";

export interface CampaignRun {
  id: string;
  status: RunStatus;
  cancel_reason: CancelReason | null;
  scheduled_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  skipped_opted_out_count: number;
}

export interface RunPresentation {
  label: string;
  tone: RunTone;
  /** One sentence: what happened, and what to do about it. Null when nothing needs saying. */
  detail: string | null;
  actions: RunAction[];
  showProgress: boolean;
}

export interface PresentRunOptions {
  /** IANA zone from business_settings.timezone. Falls back to the viewer's zone. */
  orgTimezone?: string | null;
  /** Not yet stored; see PauseReason. */
  pauseReason?: PauseReason | null;
  /** Injectable for tests. Defaults to now. */
  now?: Date;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Formats an instant in the organisation's zone, naming the zone so it is unambiguous. */
export function formatInOrgTime(iso: string, orgTimezone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown time";
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: orgTimezone || undefined,
    }).format(date);
    return orgTimezone ? `${formatted} (${orgTimezone})` : formatted;
  } catch {
    // Invalid IANA zone — better to show the time in the viewer's zone than nothing.
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

/**
 * Present a run. Returns null when there is no run, in which case the caller
 * should fall back to the campaign's own template state (Draft / Active) —
 * that is a property of the campaign, not of a run, and does not belong here.
 */
export function presentRun(
  run: CampaignRun | null | undefined,
  options: PresentRunOptions = {},
): RunPresentation | null {
  if (!run) return null;

  const { orgTimezone, pauseReason, now = new Date() } = options;
  const total = run.total_recipients ?? 0;
  const sent = run.sent_count ?? 0;

  switch (run.status) {
    case "pending": {
      const scheduledAt = run.scheduled_at;
      const isFuture = scheduledAt ? new Date(scheduledAt).getTime() > now.getTime() : false;
      if (isFuture) {
        return {
          label: "Scheduled",
          tone: "neutral",
          detail: `Sends ${formatInOrgTime(scheduledAt as string, orgTimezone)}.`,
          actions: ["cancel"],
          showProgress: false,
        };
      }
      return {
        label: "Starting",
        tone: "active",
        detail: "Queuing recipients.",
        actions: ["cancel"],
        showProgress: false,
      };
    }

    case "running":
      return {
        label: "Sending",
        tone: "active",
        detail: `${sent} of ${plural(total, "message")} sent.`,
        actions: ["pause", "cancel"],
        showProgress: true,
      };

    case "paused":
      if (pauseReason === "sms_not_configured") {
        return {
          label: "Paused: SMS not set up",
          tone: "warning",
          detail: "Add your OpenPhone credentials in Settings, then resume.",
          actions: ["resume", "cancel"],
          showProgress: true,
        };
      }
      return {
        label: "Paused",
        tone: "paused",
        detail: "Queued messages are held. Resume picks up where it stopped.",
        actions: ["resume", "cancel"],
        showProgress: true,
      };

    case "completed":
      return {
        label: "Sent",
        tone: "success",
        detail: `${sent} of ${plural(total, "message")} delivered.`,
        actions: [],
        showProgress: true,
      };

    case "cancelled":
      switch (run.cancel_reason) {
        case "expired":
          return {
            label: "Expired",
            tone: "warning",
            detail: "This sat paused for over 24 hours and expired before sending.",
            actions: [],
            showProgress: sent > 0,
          };
        case "enqueue_stalled":
          return {
            label: "Never started",
            tone: "danger",
            detail: "Recipients failed to queue, so nothing was sent. Re-run it.",
            actions: [],
            showProgress: false,
          };
        case "user_cancelled":
        default:
          return {
            label: "Cancelled",
            tone: "neutral",
            detail: "You cancelled this. Remaining messages were dropped.",
            actions: [],
            showProgress: sent > 0,
          };
      }

    default:
      return null;
  }
}

/** True while a run warrants polling — i.e. its state can still change on its own. */
export function isRunActive(run: CampaignRun | null | undefined): boolean {
  if (!run) return false;
  return run.status === "pending" || run.status === "running" || run.status === "paused";
}
