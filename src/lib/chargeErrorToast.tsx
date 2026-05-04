import { ToastAction } from "@/components/ui/toast";
import { toast as legacyToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";

/**
 * Charge-failure UX helper.
 *
 * Maps a failure_reason string (returned by charge-customer-card / charge-card-directly /
 * charge-card-manual edge functions, or recorded in `charge_audit_log.failure_reason`)
 * to a friendly toast with an actionable CTA when applicable.
 *
 * Most important case: "No payment method on file" — render a button that triggers
 * the SMS card-collection link via the `send-card-link-sms` edge function so the
 * admin can recover from the failure without leaving the screen.
 */

export type ChargeFailureCustomer = {
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
};

export type ChargeFailureContext = {
  failureReason?: string | null;
  /** Stripe decline_code if available (e.g. "insufficient_funds", "expired_card"). */
  declineCode?: string | null;
  /** Stripe declined the card at the bank (vs. an internal pre-flight failure). */
  declined?: boolean;
  customer?: ChargeFailureCustomer | null;
  organizationId?: string | null;
  amount?: number | null;
};

type Classification = {
  title: string;
  description: string;
  /** When true, the toast should expose an SMS-card-collection action. */
  showSendCardLink: boolean;
};

const NO_CARD_PATTERNS = [
  /no payment method/i,
  /no card on file/i,
  /no saved card/i,
  /missing payment method/i,
  /payment method.*not found/i,
];

const DECLINE_HINTS: Record<string, string> = {
  insufficient_funds: "The card was declined for insufficient funds. Ask the client for a different card.",
  expired_card: "The card on file has expired. Send a new card-collection link.",
  card_declined: "The bank declined the card. Ask the client for a different card.",
  incorrect_cvc: "The card's security code is incorrect. Re-collect the card.",
  processing_error: "The bank had a temporary processing error. Try again in a moment.",
  lost_card: "The card was reported lost. The client must provide a new one.",
  stolen_card: "The card was reported stolen. The client must provide a new one.",
};

function customerDisplayName(c?: ChargeFailureCustomer | null): string {
  if (!c) return "Customer";
  if (c.name) return c.name;
  const composed = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return composed || "Customer";
}

function classify(ctx: ChargeFailureContext): Classification {
  const reason = (ctx.failureReason || "").trim();

  // 1. Internal pre-flight: no card on file → SHOW the action
  if (reason && NO_CARD_PATTERNS.some((p) => p.test(reason))) {
    return {
      title: "No card on file",
      description:
        "This client does not have a saved payment method. Send them an SMS link to securely add one.",
      showSendCardLink: true,
    };
  }

  // 2. Stripe bank decline with a known decline_code
  if (ctx.declined && ctx.declineCode && DECLINE_HINTS[ctx.declineCode]) {
    return {
      title: "Card declined",
      description: DECLINE_HINTS[ctx.declineCode],
      showSendCardLink: ctx.declineCode === "expired_card" || ctx.declineCode === "lost_card" || ctx.declineCode === "stolen_card",
    };
  }

  // 3. Generic decline
  if (ctx.declined) {
    return {
      title: "Card declined",
      description: reason || "The bank declined the charge. Try a different card.",
      showSendCardLink: false,
    };
  }

  // 4. Fallback
  return {
    title: "Charge failed",
    description: reason || "Unable to process the charge. Please try again.",
    showSendCardLink: false,
  };
}

async function sendCardLinkSms(ctx: ChargeFailureContext): Promise<void> {
  const phone = ctx.customer?.phone?.trim();
  if (!phone) {
    sonnerToast.error("No phone number on file for this client — cannot send card link.");
    return;
  }
  if (!ctx.organizationId) {
    sonnerToast.error("Organization context missing — refresh and try again.");
    return;
  }

  const sending = sonnerToast.loading("Sending card-collection link…");
  try {
    const { error } = await supabase.functions.invoke("send-card-link-sms", {
      body: {
        phone,
        email: ctx.customer?.email || "",
        customerName: customerDisplayName(ctx.customer),
        organizationId: ctx.organizationId,
        amount: ctx.amount ?? 0,
      },
    });
    if (error) throw error;
    sonnerToast.success("Card-collection link sent", {
      id: sending,
      description: `SMS sent to ${phone}`,
    });
  } catch (err: any) {
    sonnerToast.error("Failed to send card link", {
      id: sending,
      description: err?.message || "Try again from the customer profile.",
    });
  }
}

/* ---------- Public API: sonner variant (preferred for new code) ---------- */

export function showChargeFailureToastSonner(ctx: ChargeFailureContext): void {
  const c = classify(ctx);
  sonnerToast.error(c.title, {
    description: c.description,
    duration: c.showSendCardLink ? 12000 : 6000,
    action: c.showSendCardLink && ctx.customer?.phone
      ? {
          label: "Send card link",
          onClick: () => {
            void sendCardLinkSms(ctx);
          },
        }
      : undefined,
  });
}

/* ---------- Public API: legacy shadcn toast variant ---------- */

export function showChargeFailureToastLegacy(ctx: ChargeFailureContext): void {
  const c = classify(ctx);
  legacyToast({
    title: c.title,
    description: c.description,
    variant: "destructive",
    duration: c.showSendCardLink ? 12000 : 6000,
    action:
      c.showSendCardLink && ctx.customer?.phone ? (
        <ToastAction
          altText="Send card-collection link via SMS"
          onClick={() => void sendCardLinkSms(ctx)}
        >
          Send card link
        </ToastAction>
      ) : undefined,
  });
}

/** Best-effort extractor for the failure reason string returned by charge edge functions. */
export function extractFailureReason(data: any, fallback?: string | null): string | null {
  if (!data) return fallback ?? null;
  return (
    data.failure_reason ||
    data.failureReason ||
    data.error ||
    data.message ||
    fallback ||
    null
  );
}
