import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

// Platform admin phone number for notifications
const PLATFORM_ADMIN_PHONE = "+18137356859";

/**
 * STRIPE INVOICE WEBHOOK
 * 
 * This webhook handles Stripe events for invoice payments and new subscriptions.
 * When a new subscription is created, it notifies the platform admin via SMS.
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Parse event - verify signature if webhook secret is configured
    if (stripeWebhookSecret && signature) {
      const tempStripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_placeholder", { 
        apiVersion: "2025-08-27.basil" 
      });
      
      try {
        event = tempStripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
      } catch (err: any) {
        console.error("[stripe-invoice-webhook] Webhook signature verification failed:", err.message);
        return new Response(
          JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Parse event without verification (for testing only)
      event = JSON.parse(body);
      console.warn("[stripe-invoice-webhook] Warning: Webhook signature not verified");
    }

    console.log("[stripe-invoice-webhook] Received Stripe event:", event.type);

    // Extract organization_id from event metadata if available
    let organizationId: string | null = null;

    // Handle new subscription created - notify platform admin
    if (event.type === "customer.subscription.created") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerEmail = subscription.customer as string;
      
      console.log("[stripe-invoice-webhook] New subscription created:", subscription.id);
      
      // Get customer details from Stripe
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { 
          apiVersion: "2025-08-27.basil" 
        });
        const customer = await stripe.customers.retrieve(customerEmail);
        const email = (customer as Stripe.Customer).email || "Unknown";
        
        // Find the organization for this user
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle();
          
        let orgName = "New Business";
        if (profile?.id) {
          const { data: membership } = await supabase
            .from('org_memberships')
            .select('organization:organizations(name)')
            .eq('user_id', profile.id)
            .maybeSingle();
            
          if (membership?.organization) {
            const org = membership.organization as unknown as { name: string };
            if (org?.name) {
              orgName = org.name;
            }
          }
        }
        
        // Send SMS notification to platform admin
        await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
          organizationName: orgName,
          ownerEmail: email,
          subscriptionType: subscription.status === 'trialing' ? 'Trial Started' : 'Active',
        });
        
      } catch (notifyError) {
        console.error("[stripe-invoice-webhook] Failed to notify admin:", notifyError);
        // Don't fail the webhook - notification is non-critical
      }
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log("[stripe-invoice-webhook] Checkout session completed:", session.id);
      console.log("[stripe-invoice-webhook] Session metadata:", session.metadata);

      organizationId = session.metadata?.organization_id || null;
      const invoiceId = session.metadata?.invoice_id;
      
      // If this is a subscription checkout (not invoice payment), notify admin
      if (session.mode === 'subscription' && session.subscription) {
        try {
          const customerEmail = session.customer_email || "Unknown";
          
          // Find the organization for this user
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', customerEmail)
            .maybeSingle();
            
          let orgName = "New Business";
          if (profile?.id) {
            const { data: membership } = await supabase
              .from('org_memberships')
              .select('organization:organizations(name)')
              .eq('user_id', profile.id)
              .maybeSingle();
              
            if (membership?.organization) {
              const org = membership.organization as unknown as { name: string };
              if (org?.name) {
                orgName = org.name;
              }
            }
          }
          
          // Send SMS notification to platform admin
          await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
            organizationName: orgName,
            ownerEmail: customerEmail,
            subscriptionType: 'New Subscription',
          });
          
        } catch (notifyError) {
          console.error("[stripe-invoice-webhook] Failed to notify admin on checkout:", notifyError);
        }
      }
      
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
          console.error("[stripe-invoice-webhook] Failed to update invoice status:", updateError);
        } else {
          console.log("[stripe-invoice-webhook] Invoice marked as paid:", invoiceId);
        }
      }
    }

    // Handle invoice.paid event from Stripe Invoicing
    if (event.type === "invoice.paid") {
      const stripeInvoice = event.data.object as Stripe.Invoice;
      
      console.log("[stripe-invoice-webhook] Stripe invoice paid:", stripeInvoice.id);
      console.log("[stripe-invoice-webhook] Invoice metadata:", stripeInvoice.metadata);

      organizationId = stripeInvoice.metadata?.organization_id || null;
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
          console.error("[stripe-invoice-webhook] Failed to update invoice status:", updateError);
        } else {
          console.log("[stripe-invoice-webhook] Invoice marked as paid:", invoiceId);
        }
      }
    }

    // Handle payment_intent.succeeded as fallback
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      console.log("[stripe-invoice-webhook] Payment intent succeeded:", paymentIntent.id);
      console.log("[stripe-invoice-webhook] Payment metadata:", paymentIntent.metadata);

      organizationId = paymentIntent.metadata?.organization_id || null;
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
          console.error("[stripe-invoice-webhook] Failed to update invoice status:", updateError);
        } else {
          console.log("[stripe-invoice-webhook] Invoice marked as paid:", invoiceId);
        }
      }
    }

    // Log organization context if available
    if (organizationId) {
      console.log("[stripe-invoice-webhook] Event processed for organization:", organizationId);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[stripe-invoice-webhook] Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

// Helper function to send admin notification
async function sendAdminNotification(
  supabaseUrl: string, 
  supabaseServiceKey: string,
  data: { organizationName: string; ownerEmail: string; subscriptionType: string }
): Promise<void> {
  const openphoneApiKey = Deno.env.get("OPENPHONE_API_KEY");
  const openphonePhoneNumberId = Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

  if (!openphoneApiKey || !openphonePhoneNumberId) {
    console.log("[stripe-invoice-webhook] OpenPhone not configured - skipping admin notification");
    return;
  }

  const timestamp = new Date().toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true 
  });

  const message = `🎉 NEW SUBSCRIPTION!\n\n` +
    `Business: ${data.organizationName}\n` +
    `Email: ${data.ownerEmail}\n` +
    `Status: ${data.subscriptionType}\n` +
    `Time: ${timestamp}`;

  console.log(`[stripe-invoice-webhook] Sending admin notification to ${PLATFORM_ADMIN_PHONE}`);

  const response = await fetch("https://api.openphone.com/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": openphoneApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: openphonePhoneNumberId,
      to: [PLATFORM_ADMIN_PHONE],
      content: message,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[stripe-invoice-webhook] Failed to send admin notification: ${response.status} - ${errorText}`);
  } else {
    console.log("[stripe-invoice-webhook] Admin notification sent successfully");
  }
}

serve(handler);
