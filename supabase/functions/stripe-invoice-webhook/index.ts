import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!stripeSecretKey) {
    return new Response(
      JSON.stringify({ error: "Stripe secret key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (stripeWebhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
      } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return new Response(
          JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Parse event without verification (for testing)
      event = JSON.parse(body);
      console.log("Warning: Webhook signature not verified");
    }

    console.log("Received Stripe event:", event.type);

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log("Checkout session completed:", session.id);
      console.log("Session metadata:", session.metadata);

      const invoiceId = session.metadata?.invoice_id;
      
      if (invoiceId) {
        // Update invoice status to paid
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq("id", invoiceId);

        if (updateError) {
          console.error("Failed to update invoice status:", updateError);
        } else {
          console.log("Invoice marked as paid:", invoiceId);
        }
      }
    }

    // Handle invoice.paid event from Stripe Invoicing
    if (event.type === "invoice.paid") {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      
      console.log("Stripe invoice paid:", stripeInvoice.id);
      console.log("Invoice metadata:", stripeInvoice.metadata);

      const invoiceId = stripeInvoice.metadata?.invoice_id;
      
      if (invoiceId) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: stripeInvoice.payment_intent as string,
          })
          .eq("id", invoiceId);

        if (updateError) {
          console.error("Failed to update invoice status:", updateError);
        } else {
          console.log("Invoice marked as paid:", invoiceId);
        }
      }
    }

    // Handle payment_intent.succeeded as fallback
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      console.log("Payment intent succeeded:", paymentIntent.id);
      console.log("Payment metadata:", paymentIntent.metadata);

      const invoiceId = paymentIntent.metadata?.invoice_id;
      
      if (invoiceId) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntent.id,
          })
          .eq("id", invoiceId);

        if (updateError) {
          console.error("Failed to update invoice status:", updateError);
        } else {
          console.log("Invoice marked as paid:", invoiceId);
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
