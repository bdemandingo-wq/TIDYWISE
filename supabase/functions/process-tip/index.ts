import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";
import { logAudit } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ProcessTipRequest {
  token: string;
  amount: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appUrl = Deno.env.get("APP_URL") || req.headers.get("origin") || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { token, amount } = await req.json() as ProcessTipRequest;

    if (!token || !amount || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token or amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tip record
    const { data: tip, error: tipError } = await supabase
      .from('tips')
      .select('*, bookings:booking_id(booking_number, customer:customers(email))')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (tipError || !tip) {
      return new Response(
        JSON.stringify({ success: false, error: "Tip request not found or already processed" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org Stripe client
    const stripeResult = await getOrgStripeClient(tip.organization_id);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(
        JSON.stringify({ success: false, error: stripeResult.error || "Stripe not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = stripeResult.stripe;
    const bookingData = tip.bookings as any;
    const customerData = bookingData?.customer;
    const customerEmail = Array.isArray(customerData) ? customerData[0]?.email : customerData?.email;

    // Create Stripe Checkout session for the tip
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Tip for Booking #${bookingData?.booking_number || 'N/A'}`,
            description: 'Thank you for your generosity!',
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      success_url: `${appUrl}/tip/${token}?status=success`,
      cancel_url: `${appUrl}/tip/${token}?status=cancelled`,
      metadata: {
        tip_id: tip.id,
        booking_id: tip.booking_id,
        organization_id: tip.organization_id,
      },
    });

    // Update tip with amount and checkout session ID (not yet paid - awaiting Stripe checkout)
    await supabase
      .from('tips')
      .update({
        amount,
        payment_intent_id: session.id,
      })
      .eq('id', tip.id);

    logAudit({
      action: 'payment.tip',
      organizationId: tip.organization_id,
      resourceType: 'tip',
      resourceId: tip.id,
      success: true,
      details: { amount, bookingId: tip.booking_id },
    });

    return new Response(
      JSON.stringify({ success: true, url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[process-tip] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
