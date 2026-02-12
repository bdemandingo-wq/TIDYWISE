import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";
import { logAudit } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch tip
    const { data: tip, error: tipError } = await supabase
      .from('tips')
      .select('id, organization_id, payment_intent_id, status, amount, booking_id')
      .eq('token', token)
      .single();

    if (tipError || !tip) {
      return new Response(
        JSON.stringify({ success: false, error: "Tip not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tip.status === 'paid') {
      return new Response(
        JSON.stringify({ success: true, already_paid: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tip.payment_intent_id) {
      return new Response(
        JSON.stringify({ success: false, error: "No payment session found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify payment with Stripe
    const stripeResult = await getOrgStripeClient(tip.organization_id);
    if (!stripeResult.success || !stripeResult.stripe) {
      return new Response(
        JSON.stringify({ success: false, error: "Stripe not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = await stripeResult.stripe.checkout.sessions.retrieve(tip.payment_intent_id);

    if (session.payment_status === 'paid') {
      await supabase
        .from('tips')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_intent_id: (session.payment_intent as string) || tip.payment_intent_id,
        })
        .eq('id', tip.id);

      logAudit({
        action: 'payment.tip',
        organizationId: tip.organization_id,
        resourceType: 'tip',
        resourceId: tip.id,
        success: true,
        details: { amount: tip.amount, bookingId: tip.booking_id },
      });

      return new Response(
        JSON.stringify({ success: true, paid: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, paid: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[confirm-tip-payment] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
