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

    console.log("[stripe-invoice-webhook] Received Stripe event:", event.type, event.id);

    // ── IDEMPOTENCY CHECK ───────────────────────────────────────────────────
    // Stripe may retry events; ensure we only process each event once.
    if (event.id) {
      const { error: idempotencyError } = await supabase
        .from("stripe_webhook_events")
        .insert({
          event_id: event.id,
          event_type: event.type,
          source: "stripe-invoice-webhook",
        });

      if (idempotencyError) {
        // Duplicate key violation = already processed
        if (idempotencyError.code === "23505") {
          console.log("[stripe-invoice-webhook] Event already processed, skipping:", event.id);
          return new Response(
            JSON.stringify({ received: true, duplicate: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Other DB errors: log but continue (don't block legitimate events)
        console.error("[stripe-invoice-webhook] Idempotency insert error (non-fatal):", idempotencyError);
      }
    }

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

        // Trigger Make subscription confirmation email
        try {
          const makeSubWebhookUrl = "https://hook.us2.make.com/1dcdsn08refadbtlbj1v1j8uxel4dwil";
          const profileData = await supabase
            .from('profiles')
            .select('full_name')
            .eq('email', email)
            .maybeSingle();

          await fetch(makeSubWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              full_name: profileData?.data?.full_name || orgName,
              organization_name: orgName,
              subscription_status: subscription.status === 'trialing' ? 'Trial Started' : 'Active',
              subscribed_at: new Date().toISOString(),
            }),
          });
          console.log("[stripe-invoice-webhook] Make subscription confirmation webhook triggered");
        } catch (makeErr) {
          console.error("[stripe-invoice-webhook] Make webhook failed (non-critical):", makeErr);
        }

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

          // Trigger Make subscription confirmation email
          try {
            const makeSubWebhookUrl = "https://hook.us2.make.com/1dcdsn08refadbtlbj1v1j8uxel4dwil";
            const profileData = await supabase
              .from('profiles')
              .select('full_name')
              .eq('email', customerEmail)
              .maybeSingle();

            await fetch(makeSubWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: customerEmail,
                full_name: profileData?.data?.full_name || orgName,
                organization_name: orgName,
                subscription_status: 'New Subscription',
                subscribed_at: new Date().toISOString(),
              }),
            });
            console.log("[stripe-invoice-webhook] Make subscription confirmation webhook triggered (checkout)");
          } catch (makeErr) {
            console.error("[stripe-invoice-webhook] Make webhook failed (non-critical):", makeErr);
          }

        } catch (notifyError) {
          console.error("[stripe-invoice-webhook] Failed to notify admin on checkout:", notifyError);
        }
      }
      
      // ── Lifetime access purchase ──────────────────────────────────────────
      if (session.mode === "payment" && session.metadata?.plan === "lifetime") {
        const email = (session.customer_email || session.metadata?.email || "").toLowerCase();
        const userId = session.metadata?.user_id || null;

        console.log("[stripe-invoice-webhook] Lifetime purchase confirmed:", { email, userId });

        // Insert purchase record (idempotent via UNIQUE on stripe_session_id)
        const { error: insertError } = await supabase
          .from("lifetime_access_purchases")
          .upsert(
            {
              email,
              user_id: userId || null,
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string | null,
              amount_cents: 20000,
            },
            { onConflict: "stripe_session_id", ignoreDuplicates: true }
          );

        if (insertError) {
          console.error("[stripe-invoice-webhook] Failed to record lifetime purchase:", insertError);
        } else {
          console.log("[stripe-invoice-webhook] Lifetime purchase recorded");

          // Update the organization's plan_type to 'lifetime'
          if (userId) {
            const { data: membership } = await supabase
              .from("org_memberships")
              .select("organization_id")
              .eq("user_id", userId)
              .limit(1)
              .maybeSingle();

            if (membership?.organization_id) {
              await supabase
                .from("organizations")
                .update({ plan_type: "lifetime" })
                .eq("id", membership.organization_id);

              // Link purchase to org
              await supabase
                .from("lifetime_access_purchases")
                .update({ organization_id: membership.organization_id })
                .eq("stripe_session_id", session.id);

              console.log("[stripe-invoice-webhook] Organization plan_type set to lifetime:", membership.organization_id);
            }
          }

          // Notify platform admin
          await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
            organizationName: "Lifetime Purchase",
            ownerEmail: email,
            subscriptionType: "Lifetime Access — $200",
          });
        }
      }
      // ── Standard subscription checkout ────────────────────────────────────
      else if (session.mode === "subscription" && session.subscription) {
        // Update plan_type to 'standard' on the org
        const customerEmail = session.customer_email || session.metadata?.email || "";
        if (customerEmail) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", customerEmail)
            .maybeSingle();

          if (profile?.id) {
            const { data: membership } = await supabase
              .from("org_memberships")
              .select("organization_id")
              .eq("user_id", profile.id)
              .limit(1)
              .maybeSingle();

            if (membership?.organization_id) {
              await supabase
                .from("organizations")
                .update({ plan_type: "standard" })
                .eq("id", membership.organization_id);
            }
          }
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

    // ── FRAUD-DEFENSE EVIDENCE CAPTURE (Visa CE 3.0 / reason 10.4) ──────────
    // For successful subscription charges, persist auth evidence and send a
    // branded receipt so the charge is recognizable.
    if (event.type === "invoice.payment_succeeded" || event.type === "invoice.paid") {
      const inv = event.data.object as Stripe.Invoice;
      const meta = (inv.metadata || {}) as Record<string, string>;
      const subMeta = ((inv.subscription_details?.metadata as any) || {}) as Record<string, string>;
      const combined = { ...subMeta, ...meta };

      if (combined.purpose === "tidywise_saas_subscription" || inv.subscription) {
        try {
          const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
          const pi = inv.payment_intent ? await stripe.paymentIntents.retrieve(inv.payment_intent as string) : null;
          const charge = pi?.latest_charge ? await stripe.charges.retrieve(pi.latest_charge as string) : null;
          const threeDS = (charge?.payment_method_details as any)?.card?.three_d_secure?.result || null;

          // Look up Supabase user by account_id metadata or customer email
          const customerEmail = inv.customer_email || (combined.email as string) || null;
          let userId: string | null = (combined.account_id as string) || null;
          let signupDate: string | null = (combined.signup_date as string) || null;
          let tosRow: any = null;
          if (userId) {
            const { data: tos } = await supabase
              .from("tos_acceptances")
              .select("accepted, tos_version, accepted_at")
              .eq("user_id", userId)
              .order("accepted_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            tosRow = tos;
          }

          await supabase.from("payment_evidence").upsert({
            user_id: userId,
            email: customerEmail || "",
            stripe_customer_id: inv.customer as string,
            stripe_payment_intent_id: (inv.payment_intent as string) || null,
            stripe_invoice_id: inv.id,
            stripe_subscription_id: (inv.subscription as string) || null,
            amount_cents: inv.amount_paid,
            currency: inv.currency,
            ip_address: combined.ip || null,
            user_agent: combined.device || null,
            device_fingerprint: combined.device_fingerprint || null,
            signup_date: signupDate,
            tos_accepted: tosRow?.accepted ?? null,
            tos_version: tosRow?.tos_version ?? null,
            tos_accepted_at: tosRow?.accepted_at ?? null,
            three_d_secure_status: threeDS,
            metadata: combined,
          }, { onConflict: "stripe_payment_intent_id" });

          console.log("[stripe-invoice-webhook] Payment evidence captured for", inv.id);

          // Branded receipt email
          if (customerEmail) {
            await supabase.functions.invoke("send-subscription-receipt", {
              body: {
                email: customerEmail,
                amount_cents: inv.amount_paid,
                currency: inv.currency,
                invoice_id: inv.id,
                hosted_invoice_url: inv.hosted_invoice_url,
                period_end: inv.period_end,
              },
            }).catch((e) => console.error("[stripe-invoice-webhook] receipt invoke failed", e));
          }
        } catch (e) {
          console.error("[stripe-invoice-webhook] evidence capture error (non-fatal):", e);
        }
      }
    }

    // ── DISPUTE / CHARGEBACK HANDLING (Visa CE 3.0, reason 10.4) ────────────
    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated") {
      try {
        const dispute = event.data.object as Stripe.Dispute;
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
          apiVersion: "2025-08-27.basil",
        });

        const charge = await stripe.charges.retrieve(dispute.charge as string);
        const paymentIntentId = (charge.payment_intent as string) || null;
        const customerId = (charge.customer as string) || null;
        const customerEmail = charge.billing_details?.email || charge.receipt_email || null;
        const disputeCreatedSec = dispute.created;

        // Look up the disputed charge's stored evidence
        const { data: disputedEvidence } = await supabase
          .from("payment_evidence")
          .select("*")
          .eq("stripe_payment_intent_id", paymentIntentId || "")
          .maybeSingle();

        // Prior undisputed successful charges for this customer
        const { data: priors } = await supabase
          .from("payment_evidence")
          .select("*")
          .eq("stripe_customer_id", customerId || "")
          .neq("stripe_payment_intent_id", paymentIntentId || "__none__")
          .order("created_at", { ascending: false })
          .limit(50);

        // CE 3.0 window: 120-365 days BEFORE the dispute
        const disputeMs = disputeCreatedSec * 1000;
        const minMs = disputeMs - 365 * 24 * 60 * 60 * 1000;
        const maxMs = disputeMs - 120 * 24 * 60 * 60 * 1000;

        const matchElements = (a: any, b: any) => {
          const m: string[] = [];
          if (a?.email && b?.email && a.email === b.email) m.push("email");
          if (a?.ip_address && b?.ip_address && a.ip_address === b.ip_address) m.push("ip_address");
          if (a?.user_agent && b?.user_agent && a.user_agent === b.user_agent) m.push("device");
          if (a?.user_id && b?.user_id && a.user_id === b.user_id) m.push("account_id");
          if (a?.device_fingerprint && b?.device_fingerprint && a.device_fingerprint === b.device_fingerprint) m.push("device_fingerprint");
          return m;
        };

        const qualifying = (priors || [])
          .map((p: any) => {
            const createdMs = new Date(p.created_at).getTime();
            const inWindow = createdMs >= minMs && createdMs <= maxMs;
            const matched = matchElements(p, disputedEvidence || {});
            return { row: p, inWindow, matched };
          })
          .filter((x) => x.inWindow && x.matched.length >= 2);

        const qualifiesForCe3 = qualifying.length >= 2;

        // Tos record
        let tos: any = null;
        if (disputedEvidence?.user_id) {
          const { data: tosRow } = await supabase
            .from("tos_acceptances")
            .select("accepted, tos_version, accepted_at, ip_address, user_agent")
            .eq("user_id", disputedEvidence.user_id)
            .order("accepted_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          tos = tosRow;
        }

        // Compose draft evidence mapped to Stripe dispute evidence fields
        const fmt = (ts?: string | null) =>
          ts ? new Date(ts).toISOString().slice(0, 10) : "unknown";
        const matchSummary = qualifying
          .map((q) => `${fmt(q.row.created_at)} (matches: ${q.matched.join(", ")})`)
          .join("; ");

        const ce3Argument = qualifiesForCe3
          ? `Visa Compelling Evidence 3.0: cardholder completed ${qualifying.length} prior undisputed transactions on ${matchSummary}, each sharing 2+ matching elements with the disputed charge (account_id ${disputedEvidence?.user_id || "n/a"}, email ${disputedEvidence?.email || "n/a"}, IP ${disputedEvidence?.ip_address || "n/a"}). Account active since ${fmt(disputedEvidence?.signup_date)}.${tos?.accepted ? ` Terms of Service v${tos.tos_version} accepted on ${fmt(tos.accepted_at)} from IP ${tos.ip_address || "unknown"}.` : ""} This satisfies the CE 3.0 standard for fraud reason 10.4; liability should remain with the issuer.`
          : `CE 3.0 NOT QUALIFYING: only ${qualifying.length} prior undisputed transaction(s) within the 120-365 day window share 2+ matching elements with the disputed charge. Dispute likely unwinnable on CE 3.0 grounds — consider accepting.`;

        const draftedEvidence = {
          product_description:
            "TidyWise SaaS subscription — cleaning business management software (CRM, scheduling, invoicing, payroll). Recurring monthly billing, cancellable any time from the in-app subscription page.",
          customer_email_address: customerEmail || disputedEvidence?.email || null,
          customer_purchase_ip: disputedEvidence?.ip_address || null,
          customer_signature: tos?.accepted
            ? `Terms of Service v${tos.tos_version} accepted ${fmt(tos.accepted_at)} from IP ${tos.ip_address || "unknown"}, user-agent: ${tos.user_agent || "unknown"}.`
            : null,
          billing_address: charge.billing_details?.address
            ? JSON.stringify(charge.billing_details.address)
            : null,
          access_activity_log: JSON.stringify(
            (priors || []).slice(0, 10).map((p: any) => ({
              date: p.created_at,
              ip: p.ip_address,
              email: p.email,
              amount_cents: p.amount_cents,
              payment_intent: p.stripe_payment_intent_id,
            })),
          ),
          uncategorized_text: ce3Argument,
        };

        await supabase
          .from("disputes")
          .upsert(
            {
              stripe_dispute_id: dispute.id,
              stripe_payment_intent_id: paymentIntentId,
              stripe_charge_id: dispute.charge as string,
              stripe_customer_id: customerId,
              customer_email: customerEmail,
              amount_cents: dispute.amount,
              currency: dispute.currency,
              reason: dispute.reason,
              status: dispute.status,
              qualifies_for_ce3: qualifiesForCe3,
              matching_prior_count: qualifying.length,
              drafted_evidence: draftedEvidence,
              raw_event: event.data.object,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_dispute_id" },
          );

        // Alert platform admin on creation
        if (event.type === "charge.dispute.created") {
          const amount = (dispute.amount / 100).toFixed(2);
          await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
            organizationName: "DISPUTE / CHARGEBACK",
            ownerEmail: customerEmail || "unknown",
            subscriptionType: `Dispute ${dispute.id} • $${amount} ${dispute.currency.toUpperCase()} • reason: ${dispute.reason} • CE3.0 qualifying: ${qualifiesForCe3 ? "YES" : "NO"} (${qualifying.length} priors). Review at /dashboard/disputes`,
          }).catch((e) => console.error("[stripe-invoice-webhook] dispute alert failed", e));
        }
      } catch (e) {
        console.error("[stripe-invoice-webhook] dispute handling error:", e);
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
