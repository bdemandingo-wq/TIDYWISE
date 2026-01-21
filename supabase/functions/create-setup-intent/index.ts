import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SetupIntentRequest {
  email: string;
  customerName: string;
  organizationId: string;
}

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

    const { email, customerName, organizationId }: SetupIntentRequest = await req.json();

    // SECURITY: Verify organization context matches authenticated user
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: "Organization ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in create-setup-intent");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    console.log("Creating SetupIntent for:", { email, customerName, organizationId, userId: authResult.userId });

    if (!email || !customerName) {
      return new Response(
        JSON.stringify({ error: "Email and customer name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY FIX: Look for customer with matching email AND organization_id in metadata
    const customers = await stripe.customers.list({ email: email, limit: 100 });
    let customerId: string;
    
    // Find customer that belongs to THIS organization
    const orgCustomer = customers.data.find((c: Stripe.Customer) => {
      return c.metadata?.organization_id === organizationId;
    });
    
    if (orgCustomer) {
      customerId = orgCustomer.id;
      console.log("Found existing org-specific Stripe customer:", customerId);
    } else {
      // Create new customer WITH organization_id in metadata for isolation
      const newCustomer = await stripe.customers.create({
        email: email,
        name: customerName,
        metadata: {
          organization_id: organizationId,
        },
      });
      customerId = newCustomer.id;
      console.log("Created new org-specific Stripe customer:", customerId);
    }

    // Create a SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });

    // Log the setup intent creation
    await logAudit({
      action: AuditActions.CARD_SAVED,
      userId: authResult.userId!,
      organizationId: authResult.organizationId!,
      details: { 
        customerId,
        customerEmail: email,
        setupIntentId: setupIntent.id 
      },
    });

    console.log("Created SetupIntent:", setupIntent.id);

    return new Response(JSON.stringify({ 
      clientSecret: setupIntent.client_secret,
      customerId: customerId,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in create-setup-intent function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
