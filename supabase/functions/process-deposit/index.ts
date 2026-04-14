import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";
import { logAudit } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProcessDepositRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { token } = await req.json() as ProcessDepositRequest;

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch deposit record
    const { data: deposit, error: depositError } = await supabase
      .from('deposit_requests')
      .select('*, bookings:booking_id(booking_number, customer:customers(email))')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (depositError || !deposit) {
      return new Response(
        JSON.stringify({ success: false, error: "Deposit request not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org-specific app URL
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('app_url')
      .eq('organization_id', deposit.organization_id)
      .maybeSingle();

    const appUrl = (businessSettings?.app_url || Deno.env.get("APP_URL") || Deno.env.get("PROJECT_URL") || req.headers.get("origin") || "https://jointidywise.com").replace(/\/+$/, '');

    // Get org Stripe client
    const stripeResult = await getOrgStripeClient(deposit.organization_id);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(
        JSON.stringify({ success: false, error: stripeResult.error || "Stripe not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = stripeResult.stripe;
    const bookingData = deposit.bookings as any;
    const customerData = bookingData?.customer;
    const customerEmail = Array.isArray(customerData) ? customerData[0]?.email : customerData?.email;

    // Create Stripe Checkout session for the deposit
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Deposit for Booking #${bookingData?.booking_number || 'N/A'}`,
            description: `Deposit payment of $${deposit.amount}`,
          },
          unit_amount: Math.round(deposit.amount * 100),
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/deposit/${token}?status=success`,
      cancel_url: `${appUrl}/deposit/${token}?status=cancelled`,
      metadata: {
        deposit_id: deposit.id,
        booking_id: deposit.booking_id,
        organization_id: deposit.organization_id,
      },
    });

    // Update deposit with checkout session ID
    await supabase
      .from('deposit_requests')
      .update({
        payment_intent_id: session.id,
      })
      .eq('id', deposit.id);

    logAudit({
      action: 'payment.deposit',
      organizationId: deposit.organization_id,
      resourceType: 'deposit',
      resourceId: deposit.id,
      success: true,
      details: { amount: deposit.amount, bookingId: deposit.booking_id },
    });

    return new Response(
      JSON.stringify({ success: true, url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-deposit] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
