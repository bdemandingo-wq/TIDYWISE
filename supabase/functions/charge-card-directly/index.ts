import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChargeRequest {
  email: string;
  amount: number;
  description?: string;
  organizationId: string;
  bookingId?: string;
  idempotencyKey?: string;
}

const buildIdempotencyKey = (input: { organizationId: string; bookingId?: string; email: string; amountInCents: number; description?: string }) => {
  // Include a hash of the description to avoid conflicts when the same booking/amount is retried
  // with different parameters. Also include a timestamp bucketed to ~5 second windows to prevent
  // rapid double-clicks while still allowing intentional retries after a short delay.
  const base = input.bookingId ? `booking:${input.bookingId}` : `email:${input.email}`;
  const descHash = input.description ? input.description.slice(0, 20).replace(/\s+/g, '_') : 'no_desc';
  const timeBucket = Math.floor(Date.now() / 5000); // 5-second window
  return `charge-card-directly:org:${input.organizationId}:${base}:amt:${input.amountInCents}:${descHash}:${timeBucket}`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Verify authenticated user with admin privileges
    const authResult = await verifyAdminAuth(req.headers.get("Authorization"), { requireAdmin: true });
    
    if (!authResult.success) {
      console.error("Auth failed:", authResult.error);
      return createUnauthorizedResponse(authResult.error || "Unauthorized", corsHeaders);
    }

    const { email, amount, description, organizationId, bookingId, idempotencyKey: providedIdempotencyKey }: ChargeRequest = await req.json();

    // SECURITY: Verify organization context matches authenticated user
    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in charge-card-directly");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    if (!email || !amount) {
      return new Response(
        JSON.stringify({ success: false, error: "Email and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org-specific Stripe client
    const stripeResult = await getOrgStripeClient(organizationId);
    if (!stripeResult.success || !stripeResult.stripe) {
      console.error("Failed to get Stripe client:", stripeResult.error);
      return new Response(
        JSON.stringify({ success: false, error: stripeResult.error || "Stripe not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const stripe = stripeResult.stripe;

    console.log("Charging card directly:", { email, amount, userId: authResult.userId });

    const amountInCents = Math.round(amount * 100);
    const idempotencyKey = providedIdempotencyKey || buildIdempotencyKey({
      organizationId,
      bookingId,
      email,
      amountInCents,
      description,
    });

    // SECURITY FIX: Look for customer with matching email AND organization_id in metadata
    const customers = await stripe.customers.list({ email, limit: 100 });
    
    // Find customer that belongs to THIS organization
    let customer = customers.data.find((c: Stripe.Customer) => c.metadata?.organization_id === organizationId);

    // Legacy adoption path: if there is exactly one Stripe customer with this email and it has
    // NO organization metadata, we can safely attach the organization_id to preserve access.
    // Fail-safe: if there are multiple customers for this email (or any customer is tagged to a
    // different organization), we do NOT guess.
    if (!customer) {
      const taggedToOtherOrg = customers.data.find((c: Stripe.Customer) => {
        const org = c.metadata?.organization_id;
        return !!org && org !== organizationId;
      });

      if (taggedToOtherOrg) {
        await logAudit({
          action: AuditActions.PAYMENT_FAILED,
          userId: authResult.userId!,
          organizationId: authResult.organizationId!,
          success: false,
          error: "Customer belongs to a different organization",
          details: {
            email,
            taggedCustomerId: taggedToOtherOrg.id,
            taggedOrg: taggedToOtherOrg.metadata?.organization_id,
          },
        });
        return new Response(
          JSON.stringify({
            success: false,
            error: "No customer found for this organization. Please save their card for this business first.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const legacyCandidates = customers.data.filter((c: Stripe.Customer) => !c.metadata?.organization_id);
      if (legacyCandidates.length === 1 && customers.data.length === 1) {
        const legacy = legacyCandidates[0];

        // Attach organization metadata (preserves isolation going forward)
        customer = await stripe.customers.update(legacy.id, {
          metadata: {
            ...(legacy.metadata || {}),
            organization_id: organizationId,
          },
        });

        await logAudit({
          action: AuditActions.PAYMENT_CHARGE,
          userId: authResult.userId!,
          organizationId: authResult.organizationId!,
          details: {
            email,
            adoptedCustomerId: legacy.id,
            reason: "adopt_legacy_customer_missing_org_metadata",
          },
        });
      }
    }

    if (!customer) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No customer found for this organization. Please save their card first.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let paymentMethodId: string | undefined;

    if (customer.invoice_settings?.default_payment_method) {
      paymentMethodId = customer.invoice_settings.default_payment_method as string;
    } else {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: 'card',
        limit: 1,
      });

      if (paymentMethods.data.length > 0) {
        paymentMethodId = paymentMethods.data[0].id;
      }
    }

    if (!paymentMethodId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No payment method on file. Please save their card first." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        customer: customer.id,
        payment_method: paymentMethodId,
        confirm: true,
        off_session: true,
        description: description || 'Booking charge',
        metadata: {
          organization_id: organizationId,
          customer_email: email,
          booking_id: bookingId || '',
          idempotency_key: idempotencyKey,
        },
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
      },
      {
        idempotencyKey,
      }
    );

    if (paymentIntent.status === 'succeeded') {
      // Log successful charge
      await logAudit({
        action: AuditActions.PAYMENT_CAPTURE,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { 
          paymentIntentId: paymentIntent.id, 
          amount,
          customerEmail: email,
          bookingId,
          idempotencyKey,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully charged $${amount.toFixed(2)}`,
          paymentIntentId: paymentIntent.id,
          chargedAmount: amount,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { 
          paymentIntentId: paymentIntent.id, 
          status: paymentIntent.status,
          customerEmail: email,
          bookingId,
          idempotencyKey,
        },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment status: ${paymentIntent.status}. Please try again.`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("Error charging card:", error);
    
    // Extract user-friendly message from Stripe errors
    let errorMessage = "Unknown error occurred";
    let isCardDecline = false;
    
    // Stripe errors have a 'type' property to identify card declines
    const stripeError = error as { type?: string; message?: string };
    if (stripeError?.type === "StripeCardError" || stripeError?.type === "card_error") {
      // Card was declined - user-friendly message from Stripe
      errorMessage = stripeError.message || "Your card was declined";
      isCardDecline = true;
    } else if (stripeError?.message) {
      // Other Stripe or standard errors
      errorMessage = stripeError.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    // Return 200 with success:false for card declines so the client parses it properly
    // (Supabase client throws on non-2xx, losing the body)
    const status = isCardDecline ? 200 : 500;
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
