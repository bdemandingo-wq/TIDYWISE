import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";
import { requireOrgAdmin } from "../_shared/requireOrgAdmin.ts";
import { verifyPortalSession } from "../_shared/portal-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-session",
};

interface GetPaymentMethodRequest {
  paymentMethodId: string;
  organizationId: string;
  publicBooking?: boolean;
}

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: GetPaymentMethodRequest = await req.json();
    const { paymentMethodId, publicBooking } = body;
    let organizationId = body.organizationId;

    console.log("Getting payment method details for:", paymentMethodId, "org:", organizationId);

    if (!paymentMethodId) {
      return json({ error: "Payment method ID is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let callerKind: "admin" | "portal" | "public" = "public";
    let portalCustomerId: string | null = null;

    // ---- Branch 1: portal session (checked FIRST) ----
    if (req.headers.get("x-portal-session")) {
      const session = await verifyPortalSession(req, supabase);
      if (!session.ok) return json({ error: session.error }, session.status);
      callerKind = "portal";
      organizationId = session.organization_id; // never from the body
      portalCustomerId = session.customer_id;
    }

    if (!organizationId) {
      return json({ error: "Organization ID is required" }, 400);
    }

    if (callerKind !== "portal") {
      if (publicBooking) {
        // ---- Branch 2: anonymous public booking ----
        callerKind = "public";
      } else {
        // ---- Branch 3: admin JWT (unchanged) ----
        const auth = await requireOrgAdmin(req, organizationId);
        if (auth instanceof Response) return auth;
        callerKind = "admin";
      }
    }

    // STRICT ISOLATION: Get org-specific Stripe client via shared helper
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      return json({ error: stripeResult.error || "Stripe not configured for this organization" }, 400);
    }
    const stripe = stripeResult.stripe;

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // For non-admin callers, confirm the payment method really belongs to a
    // customer of THIS organization before returning anything.
    if (callerKind !== "admin") {
      const pmCustomerId = typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : (paymentMethod.customer as Stripe.Customer | null)?.id ?? null;

      if (!pmCustomerId) {
        return json({ error: "Payment method not found" }, 404);
      }

      const stripeCustomer = await stripe.customers.retrieve(pmCustomerId);
      const metaOrg = (stripeCustomer as Stripe.Customer)?.metadata?.organization_id;
      if ((stripeCustomer as Stripe.DeletedCustomer)?.deleted || metaOrg !== organizationId) {
        console.warn("[get-payment-method-details] org mismatch for payment method");
        return json({ error: "Payment method not found" }, 404);
      }
    }

    const brand = paymentMethod.card?.brand ?? null;
    const last4 = paymentMethod.card?.last4 ?? null;

    // ---- Part 4: record the card change for admins (portal branch only) ----
    if (callerKind === "portal" && portalCustomerId) {
      try {
        const { data: cust } = await supabase
          .from("customers")
          .select("first_name, last_name")
          .eq("id", portalCustomerId)
          .maybeSingle();
        const customerName =
          `${cust?.first_name ?? ""} ${cust?.last_name ?? ""}`.trim() || "A customer";
        const today = new Date().toISOString().slice(0, 10);

        const { error: notifyErr } = await supabase
          .from("admin_system_notifications")
          .insert({
            organization_id: organizationId,
            type: "card_updated",
            title: "Payment card updated",
            message: `${customerName} updated the card on file (${brand ?? "card"} ending ${last4 ?? "????"})`,
            link: `/dashboard/customers?customer=${portalCustomerId}`,
            metadata: {
              customer_id: portalCustomerId,
              brand,
              last4,
              source: "client_portal",
            },
            dedupe_key: `card_updated:${portalCustomerId}:${last4}:${today}`,
          });

        // 23505 = already recorded today → treat as success.
        if (notifyErr && (notifyErr as { code?: string }).code !== "23505") {
          console.error("[get-payment-method-details] notification insert failed:", notifyErr.message);
        }
      } catch (e) {
        // NEVER fail the card save because the notification failed.
        console.error("[get-payment-method-details] notification error:", e);
      }
    }

    return json({
      last4,
      brand,
      expMonth: paymentMethod.card?.exp_month,
      expYear: paymentMethod.card?.exp_year,
    });
  } catch (error: any) {
    console.error("Error in get-payment-method-details function:", error);
    return json({ error: error.message }, 500);
  }
};

serve(handler);
