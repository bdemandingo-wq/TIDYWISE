import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GetCardRequest {
  email: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, organizationId }: GetCardRequest = await req.json();

    // Enforce authenticated admin + org membership (admin-only flow)
    const authHeader = req.headers.get("Authorization");
    const authResult = await verifyAdminAuth(authHeader, {
      requireAdmin: true,
      requireOrganizationId: organizationId,
    });

    if (!authResult.success) {
      logAudit({
        action: AuditActions.PAYMENT_FAILED,
        organizationId: organizationId || "unknown",
        userId: authResult.userId,
        resourceType: "stripe",
        resourceId: "get_customer_card",
        success: false,
        error: authResult.error,
        details: { email },
      });

      // Differentiate auth vs permission errors for clearer UX
      const msg = authResult.error || "Unauthorized";
      const isUnauthorized = msg.toLowerCase().includes("missing authorization") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("expired");
      return isUnauthorized
        ? createUnauthorizedResponse(msg, corsHeaders)
        : createForbiddenResponse(msg, corsHeaders);
    }

    console.log("Getting card info for:", { email, organizationId });

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL SECURITY: Require organizationId to prevent cross-tenant card access
    if (!organizationId) {
      console.error("SECURITY: Missing organizationId in get-customer-card request");
      return new Response(
        JSON.stringify({ hasCard: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get org-specific Stripe client
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      console.error("Failed to get Stripe client:", stripeResult.error);
      return new Response(
        JSON.stringify({ hasCard: false, error: stripeResult.error }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const stripe = stripeResult.stripe;

    // Find customers by email in Stripe
    const customers = await stripe.customers.list({ email: email, limit: 100 });
    console.log("Stripe customers found:", customers.data.length);
    
    // Filter to find the customer that belongs to this organization
    const orgCustomer = customers.data.find((c: Stripe.Customer) => {
      return c.metadata?.organization_id === organizationId;
    });
    
    if (!orgCustomer) {
      // Legacy restore path:
      // If there is exactly ONE Stripe customer for this email and it has no organization_id metadata,
      // we can safely attach the current organization_id to restore previously-saved cards.
      const customersWithOrg = customers.data.filter((c: Stripe.Customer) => !!c.metadata?.organization_id);
      const customersWithoutOrg = customers.data.filter((c: Stripe.Customer) => !c.metadata?.organization_id);

      const safeToAdoptLegacyCustomer = customersWithOrg.length === 0 && customersWithoutOrg.length === 1;

      if (safeToAdoptLegacyCustomer) {
        const legacyCustomer = customersWithoutOrg[0];
        console.log("Legacy Stripe customer found with no org metadata; adopting for org:", {
          legacyCustomerId: legacyCustomer.id,
          organizationId,
        });

        try {
          await stripe.customers.update(legacyCustomer.id, {
            metadata: {
              ...(legacyCustomer.metadata || {}),
              organization_id: organizationId,
            },
          });

          logAudit({
            action: AuditActions.CARD_SAVED,
            organizationId,
            userId: authResult.userId,
            resourceType: "stripe_customer",
            resourceId: legacyCustomer.id,
            success: true,
            details: { migratedLegacyCustomer: true, email },
          });

          // Continue using the adopted customer
          const adoptedCustomerId = legacyCustomer.id;
          const adoptedPaymentMethods = await stripe.paymentMethods.list({
            customer: adoptedCustomerId,
            type: "card",
            limit: 1,
          });

          if (adoptedPaymentMethods.data.length === 0) {
            return new Response(
              JSON.stringify({ hasCard: false, customerId: adoptedCustomerId }),
              { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }

          const adoptedCard = adoptedPaymentMethods.data[0].card;
          return new Response(
            JSON.stringify({
              hasCard: true,
              customerId: adoptedCustomerId,
              paymentMethodId: adoptedPaymentMethods.data[0].id,
              last4: adoptedCard?.last4,
              brand: adoptedCard?.brand,
              expMonth: adoptedCard?.exp_month,
              expYear: adoptedCard?.exp_year,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (e: any) {
          console.error("Failed legacy Stripe customer adoption:", e);
          logAudit({
            action: AuditActions.PAYMENT_FAILED,
            organizationId,
            userId: authResult.userId,
            resourceType: "stripe_customer",
            resourceId: customersWithoutOrg[0].id,
            success: false,
            error: e?.message || "Failed to adopt legacy customer",
            details: { email },
          });
        }
      }

      console.log("No Stripe customer found for email in this organization:", { email, organizationId });
      return new Response(
        JSON.stringify({ hasCard: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const customerId = orgCustomer.id;
    console.log("Found organization-specific Stripe customer:", customerId);

    // Get the customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });

    console.log("Payment methods found:", paymentMethods.data.length);

    if (paymentMethods.data.length === 0) {
      console.log("No payment methods found for customer:", customerId);
      return new Response(
        JSON.stringify({ hasCard: false, customerId }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const card = paymentMethods.data[0].card;
    console.log("Card found:", { brand: card?.brand, last4: card?.last4 });

    return new Response(JSON.stringify({ 
      hasCard: true,
      customerId,
      paymentMethodId: paymentMethods.data[0].id,
      last4: card?.last4,
      brand: card?.brand,
      expMonth: card?.exp_month,
      expYear: card?.exp_year,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in get-customer-card function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
