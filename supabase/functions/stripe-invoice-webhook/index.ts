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

    // Verify signature. Fail closed if the webhook secret isn't
    // configured — silently processing unsigned events would let any
    // caller who can reach the function URL forge subscription /
    // dispute state.
    if (!stripeWebhookSecret) {
      console.error("[stripe-invoice-webhook] STRIPE_WEBHOOK_SECRET not configured — refusing to process unsigned events");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const tempStripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_placeholder", {
      apiVersion: "2025-08-27.basil",
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
        // ANY other DB error means we can't guarantee single-execution
        // semantics. Returning 500 makes Stripe retry the delivery,
        // which is exactly what we want — better than silently
        // double-processing (eg two inviteUserByEmail calls → two
        // welcome emails to the same buyer).
        console.error("[stripe-invoice-webhook] Idempotency insert failed, refusing to process:", idempotencyError);
        return new Response(
          JSON.stringify({ error: "Idempotency lookup failed; Stripe will retry." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Extract organization_id from event metadata if available
    let organizationId: string | null = null;

    // Handle new subscription created - notify platform admin
    if (event.type === "customer.subscription.created") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const subMeta = (subscription.metadata ?? {}) as Record<string, string>;

      console.log("[stripe-invoice-webhook] New subscription created:", subscription.id);

      // ── Ad-management retainer subscription ──────────────────────────
      // Distinct from the main TidyWise plan: metadata.purpose set by
      // buy-ad-management identifies these so we can record them in
      // ad_management_subscriptions for the cascade-cancel logic.
      if (subMeta.purpose === "tidywise_ad_management" && subMeta.organization_id) {
        try {
          const platform = subMeta.ad_platform;
          const userId = subMeta.account_id || null;
          const priceId = subscription.items.data[0]?.price?.id ?? null;
          const monthlyAmount =
            subscription.items.data[0]?.price?.unit_amount ?? 40000;

          await supabase.from("ad_management_subscriptions").upsert(
            {
              organization_id: subMeta.organization_id,
              user_id: userId,
              platform,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: customerId,
              stripe_price_id: priceId,
              status: "active",
              monthly_amount_cents: monthlyAmount,
            },
            { onConflict: "stripe_subscription_id", ignoreDuplicates: false },
          );

          console.log(
            "[stripe-invoice-webhook] Ad mgmt sub recorded:",
            subscription.id,
            platform,
          );

          await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
            organizationName: "Ad Management",
            ownerEmail: subMeta.email || "unknown",
            subscriptionType: `New ad-mgmt subscription: ${platform} ($${(monthlyAmount / 100).toFixed(0)}/mo)`,
          }).catch(() => {});
        } catch (e) {
          console.error("[stripe-invoice-webhook] ad mgmt record failed:", e);
        }
        // Skip the rest of customer.subscription.created handling for
        // ad-mgmt subs — they're not the main TidyWise plan and don't
        // need the new-org admin SMS / Make webhook below.
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get customer details from Stripe
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
          apiVersion: "2025-08-27.basil"
        });
        const customer = await stripe.customers.retrieve(customerId);
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

      // Mirror this subscription into stripe_subscriptions so the org
      // immediately has an active row that the paywall gate can read.
      try {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
          apiVersion: "2025-08-27.basil",
        });
        const orgId = await resolveOrgIdForSubscription(supabase, stripe, subscription);
        if (orgId) await upsertStripeSubscription(supabase, orgId, subscription);
      } catch (mirrorErr) {
        console.error("[stripe-invoice-webhook] mirror to stripe_subscriptions failed:", mirrorErr);
      }
    }

    // Handle subscription updates (plan changes, renewals, cancellation
    // scheduled at period end, etc.) — keep stripe_subscriptions in sync.
    if (event.type === "customer.subscription.updated") {
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const subMetaUpdate = (subscription.metadata ?? {}) as Record<string, string>;
        // Ad-management retainers live in their own ad_management_subscriptions
        // table — don't mirror them into stripe_subscriptions (which tracks
        // only the main TidyWise plan). Without this early-return, the
        // updated row would pollute the customer's primary plan record.
        if (subMetaUpdate.purpose === "tidywise_ad_management") {
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
          apiVersion: "2025-08-27.basil",
        });
        const orgId = await resolveOrgIdForSubscription(supabase, stripe, subscription);
        if (orgId) await upsertStripeSubscription(supabase, orgId, subscription);
      } catch (e) {
        console.error("[stripe-invoice-webhook] subscription.updated mirror error:", e);
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
        const email = (
          session.customer_details?.email ||
          session.customer_email ||
          (session.metadata?.email as string | undefined) ||
          ""
        ).toLowerCase();
        let userId: string | null =
          (session.metadata?.user_id as string | undefined) ||
          (session.metadata?.account_id as string | undefined) ||
          null;

        // Anonymous-checkout flow: no user_id in metadata (visitor wasn't
        // logged in). Look up by email; provision the account if it
        // doesn't exist yet.
        const lifetimeSignupFlow =
          (session.metadata?.signup_flow as string | undefined) || "legacy";
        if (!userId && email) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (profile?.id) {
            userId = profile.id;
          } else if (lifetimeSignupFlow === "anonymous_checkout") {
            try {
              const fullName = session.customer_details?.name ?? null;
              const inviteUrl = `${Deno.env.get("APP_URL") || "https://jointidywise.com"}/checkout/success?from_invite=1`;
              const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
                email,
                {
                  redirectTo: inviteUrl,
                  data: fullName ? { full_name: fullName } : undefined,
                },
              );
              if (inviteErr) {
                console.error("[stripe-invoice-webhook] lifetime invite failed:", inviteErr);
              } else if (invited?.user?.id) {
                userId = invited.user.id;
                await supabase.from("profiles").insert({
                  id: userId,
                  email,
                  full_name: fullName,
                });
                // Lifetime customers get grandfathered_lifetime=true so
                // they bypass all future feature gates — the "lifetime
                // = lifetime, forever" promise applies to paying
                // customers too, not just launch grandfathers.
                const orgName = fullName ? `${fullName}'s Business` : "My Cleaning Business";
                const { data: newOrg } = await supabase
                  .from("organizations")
                  .insert({
                    name: orgName,
                    plan_type: "lifetime",
                    grandfathered_lifetime: true,
                    grandfathered_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();
                if (newOrg?.id) {
                  await supabase.from("org_memberships").insert({
                    organization_id: newOrg.id,
                    user_id: userId,
                    role: "owner",
                  });
                  console.log(
                    "[stripe-invoice-webhook] Provisioned new lifetime account",
                    { userId, orgId: newOrg.id },
                  );
                }
              }
            } catch (inviteOuter) {
              console.error("[stripe-invoice-webhook] lifetime provisioning error:", inviteOuter);
            }
          }
        }

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
              // Pull amount from the session itself so price changes in
              // Stripe don't silently produce wrong records. Falls back
              // to the historical default if Stripe somehow omits it.
              amount_cents: session.amount_total ?? 20000,
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
              // Flip plan_type to 'lifetime' AND set grandfathered_lifetime=true
              // so the feature-gating layer never locks this customer out
              // even if plan_type ever drifts. We promise lifetime = lifetime.
              await supabase
                .from("organizations")
                .update({
                  plan_type: "lifetime",
                  grandfathered_lifetime: true,
                  grandfathered_at: new Date().toISOString(),
                })
                .eq("id", membership.organization_id);

              // Link purchase to org
              await supabase
                .from("lifetime_access_purchases")
                .update({ organization_id: membership.organization_id })
                .eq("stripe_session_id", session.id);

              // Mirror into stripe_subscriptions as a synthetic 'active'
              // row so any code path that still checks for an active
              // Stripe subscription (eg legacy gates or analytics
              // queries) sees lifetime customers as covered too. The
              // updated has_active_subscription() RPC also OR-matches
              // plan_type='lifetime' directly, so this is belt-and-
              // suspenders — but losing one doesn't lock the customer
              // out. Idempotent on stripe_subscription_id.
              await supabase.from("stripe_subscriptions").upsert(
                {
                  organization_id: membership.organization_id,
                  stripe_subscription_id: `lifetime_${session.id}`,
                  stripe_customer_id: (session.customer as string) || null,
                  status: "active",
                  plan: "lifetime",
                  current_period_end: null,
                },
                { onConflict: "stripe_subscription_id", ignoreDuplicates: true },
              );

              console.log("[stripe-invoice-webhook] Organization plan_type set to lifetime:", membership.organization_id);
            }
          }

          // ── Claim one of the 50 spots (atomic) ───────────────────────
          // claim_lifetime_spot() is a single-statement UPDATE; the
          // table's CHECK(sold_spots <= total_spots) raises when a 51st
          // attempt tries to land. We catch that and refund the
          // unlucky-by-microseconds buyer.
          try {
            const { data: claimed, error: claimErr } = await supabase
              .rpc("claim_lifetime_spot");

            if (claimErr) {
              // Likely check_violation = oversold race lost.
              console.error(
                "[stripe-invoice-webhook] Lifetime oversold — refunding",
                claimErr.message,
              );
              if (session.payment_intent) {
                const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
                  apiVersion: "2025-08-27.basil",
                });
                await stripe.refunds.create({
                  payment_intent: session.payment_intent as string,
                  reason: "duplicate",
                  metadata: { reason: "lifetime_oversold" },
                });
              }
              await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
                organizationName: "LIFETIME OVERSOLD — refunded",
                ownerEmail: email,
                subscriptionType:
                  "Spot #51+ attempted, automatic refund issued. Reach out personally.",
              });
            } else {
              const row = Array.isArray(claimed) ? claimed[0] : claimed;
              console.log(
                "[stripe-invoice-webhook] Lifetime spot claimed",
                row?.sold_spots,
                "/",
                row?.total_spots,
              );
              if (row?.sold_out) {
                console.log("[stripe-invoice-webhook] Lifetime is now SOLD OUT");
              }
            }
          } catch (counterE) {
            console.error("[stripe-invoice-webhook] counter update failed:", counterE);
          }

          // Notify platform admin
          await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
            organizationName: "Lifetime Purchase",
            ownerEmail: email,
            subscriptionType: `Lifetime Access — $${((session.amount_total ?? 30000) / 100).toFixed(2)}`,
          });
        }
      }
      // ── Subscription checkout: anonymous (checkout-first) OR upgrade ──────
      else if (session.mode === "subscription" && session.subscription) {
        // /pricing flow goes straight to Stripe with no prior auth. The
        // visitor's email is collected by Stripe Checkout and stored on
        // session.customer_details.email. We provision (or upgrade) the
        // TidyWise account from this email here, after payment is
        // confirmed.
        const signupFlow = (session.metadata?.signup_flow as string | undefined) || "legacy";
        const planFromMetadata = (session.metadata?.tidywise_plan as string | undefined);
        const targetPlanType =
          planFromMetadata && ["basic", "pro", "custom"].includes(planFromMetadata)
            ? planFromMetadata
            : "standard";

        const checkoutEmail =
          (session.customer_details?.email || session.customer_email || (session.metadata?.email as string | undefined) || "")
            .toLowerCase();

        if (!checkoutEmail) {
          console.error("[stripe-invoice-webhook] Subscription checkout completed with no email");
        } else {
          // First check profiles by email — the common case for any user
          // who's signed up before. Profile rows are kept in sync with
          // auth.users via the existing signup flows, so a hit here means
          // the user exists and we can short-circuit straight to the
          // plan-update path.
          let userId: string | null = null;
          let isNewAccount = false;
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", checkoutEmail)
            .maybeSingle();
          if (profile?.id) {
            userId = profile.id;
          } else if (signupFlow === "anonymous_checkout") {
            // No profile → try to provision a new account by inviting.
            // inviteUserByEmail creates the auth user + sends a "set
            // your password" email. If the email already belongs to an
            // auth.users row (eg the profile row is missing but auth.users
            // is not), invite returns an error containing "already
            // registered" — we recover by looking up the existing user
            // via auth.admin.getUserByEmail (no pagination needed) and
            // then just upgrading their plan.
            //
            // The prior implementation paged through auth.admin.listUsers
            // with perPage:200, which silently missed any user beyond
            // page 1 — so once the project had >200 users, returning
            // customers got "already registered" errors and never had
            // their plan attached.
            try {
              const fullName = session.customer_details?.name ?? null;
              const inviteUrl = `${Deno.env.get("APP_URL") || "https://jointidywise.com"}/checkout/success?from_invite=1`;
              const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
                checkoutEmail,
                {
                  redirectTo: inviteUrl,
                  data: fullName ? { full_name: fullName } : undefined,
                },
              );
              const inviteErrMsg = inviteErr?.message?.toLowerCase() ?? "";
              const alreadyRegistered =
                inviteErr && (
                  inviteErrMsg.includes("already") ||
                  inviteErrMsg.includes("registered") ||
                  inviteErrMsg.includes("exists")
                );
              if (alreadyRegistered) {
                // Look up the existing user directly — no pagination.
                try {
                  const { data: existing } = await (supabase.auth.admin as unknown as {
                    getUserByEmail: (e: string) => Promise<{ data: { user?: { id: string } | null } }>
                  }).getUserByEmail(checkoutEmail);
                  if (existing?.user?.id) {
                    userId = existing.user.id;
                  }
                } catch (lookupErr) {
                  console.error("[stripe-invoice-webhook] getUserByEmail failed:", lookupErr);
                }
              } else if (inviteErr) {
                console.error("[stripe-invoice-webhook] inviteUserByEmail failed:", inviteErr);
              } else if (invited?.user?.id) {
                userId = invited.user.id;
                isNewAccount = true;

                await supabase.from("profiles").insert({
                  id: userId,
                  email: checkoutEmail,
                  full_name: fullName,
                });

                const orgName = fullName ? `${fullName}'s Business` : "My Cleaning Business";
                const { data: newOrg, error: orgErr } = await supabase
                  .from("organizations")
                  .insert({ name: orgName, plan_type: targetPlanType })
                  .select("id")
                  .single();
                if (orgErr) {
                  console.error("[stripe-invoice-webhook] org insert failed:", orgErr);
                } else if (newOrg?.id) {
                  await supabase.from("org_memberships").insert({
                    organization_id: newOrg.id,
                    user_id: userId,
                    role: "owner",
                  });
                  console.log(
                    "[stripe-invoice-webhook] Provisioned new account from checkout",
                    { userId, orgId: newOrg.id, plan: targetPlanType },
                  );
                }
              }
            } catch (inviteOuter) {
              console.error("[stripe-invoice-webhook] account provisioning error:", inviteOuter);
            }
          }

          if (userId && !isNewAccount) {
            const { data: membership } = await supabase
              .from("org_memberships")
              .select("organization_id")
              .eq("user_id", userId)
              .limit(1)
              .maybeSingle();
            if (membership?.organization_id) {
              await supabase
                .from("organizations")
                .update({ plan_type: targetPlanType })
                .eq("id", membership.organization_id);
              console.log(
                "[stripe-invoice-webhook] Existing org plan updated",
                { orgId: membership.organization_id, plan: targetPlanType },
              );
            }
          }

          // Mirror the new/upgraded subscription into stripe_subscriptions
          // so the paywall gate opens immediately, without waiting for the
          // separate customer.subscription.created event.
          try {
            const stripeSubId = typeof session.subscription === "string"
              ? session.subscription
              : (session.subscription as any)?.id;
            if (stripeSubId) {
              const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
                apiVersion: "2025-08-27.basil",
              });
              const fullSub = await stripe.subscriptions.retrieve(stripeSubId);
              let orgId: string | null = null;
              if (userId) {
                const { data: mem } = await supabase
                  .from("org_memberships")
                  .select("organization_id")
                  .eq("user_id", userId)
                  .limit(1)
                  .maybeSingle();
                orgId = mem?.organization_id ?? null;
              }
              if (orgId) await upsertStripeSubscription(supabase, orgId, fullSub);
            }
          } catch (mirrorErr) {
            console.error("[stripe-invoice-webhook] checkout mirror failed:", mirrorErr);
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
    // branded receipt so the charge is recognizable. Gated on invoice.paid
    // only: Stripe sends both invoice.payment_succeeded AND invoice.paid
    // for the same renewal, with different event IDs. The webhook
    // idempotency check upstream is keyed on event_id so both events
    // pass through, which previously meant two evidence-capture passes,
    // two PI/charge retrieves, and two receipt emails per renewal.
    // invoice.paid is Stripe's recommended event for "this invoice is
    // confirmed paid"; invoice.payment_succeeded fires earlier and can
    // briefly precede a refund/dispute.
    if (event.type === "invoice.paid") {
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

          // Branded receipt email. Yearly subscribers in particular need
          // a clear "next billing date" so they know when the renewal
          // hits — pass plan + interval through so the receipt can
          // render the right copy.
          if (customerEmail) {
            await supabase.functions.invoke("send-subscription-receipt", {
              body: {
                email: customerEmail,
                amount_cents: inv.amount_paid,
                currency: inv.currency,
                invoice_id: inv.id,
                hosted_invoice_url: inv.hosted_invoice_url,
                period_end: inv.period_end,
                plan: combined.tidywise_plan || null,
                interval: combined.tidywise_interval || null,
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


    // ── SUBSCRIPTION CANCELLED / ENDED ──────────────────────────────────────
    // When Stripe finalizes a subscription deletion (either user-initiated
    // cancel after period end, or terminal dunning failure), revoke paid
    // plan access on the org. Without this branch the org's plan_type
    // stayed "standard" forever after cancellation — users kept full
    // access to the paid product for free until something else updated it.
    if (event.type === "customer.subscription.deleted") {
      try {
        const sub = event.data.object as Stripe.Subscription;
        const subMeta = (sub.metadata ?? {}) as Record<string, string>;
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
          apiVersion: "2025-08-27.basil",
        });

        // Branch 1: ad-management retainer cancelled (its own Stripe sub).
        // Just mark the row inactive; no cascade or plan-type change.
        if (subMeta.purpose === "tidywise_ad_management") {
          await supabase
            .from("ad_management_subscriptions")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              cancellation_reason: "stripe_subscription_deleted",
            })
            .eq("stripe_subscription_id", sub.id);
          console.log(
            "[stripe-invoice-webhook] Ad-management subscription cancelled:",
            sub.id,
          );
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Branch 2: main TidyWise subscription cancelled — revoke paid
        // plan access AND cascade-cancel any ad-management retainers
        // for the same org (per spec: ads can't outlive TidyWise).
        const customer = await stripe.customers.retrieve(sub.customer as string);
        const email = (customer as Stripe.Customer).email;

        if (email) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", email)
            .maybeSingle();

          if (profile?.id) {
            const { data: membership } = await supabase
              .from("org_memberships")
              .select("organization_id")
              .eq("user_id", profile.id)
              .limit(1)
              .maybeSingle();

            if (membership?.organization_id) {
              // Mark the org's subscription row canceled so the paywall
              // gate kicks back in immediately.
              await supabase
                .from("stripe_subscriptions")
                .update({
                  status: sub.status || "canceled",
                  cancel_at_period_end: !!sub.cancel_at_period_end,
                  updated_at: new Date().toISOString(),
                })
                .eq("stripe_subscription_id", sub.id);

              await supabase
                .from("organizations")
                .update({ plan_type: "free" })
                .eq("id", membership.organization_id);
              console.log(
                "[stripe-invoice-webhook] Subscription deleted, org reverted to free:",
                membership.organization_id,
              );

              // Cascade: cancel any active ad-management subs for this
              // org in Stripe (which will fire their own
              // customer.subscription.deleted events; the branch above
              // marks them cancelled in our table) then mark them
              // cancelled locally as a defensive write in case the
              // Stripe-side cancel webhook is delayed.
              const { data: adSubs } = await supabase
                .from("ad_management_subscriptions")
                .select("stripe_subscription_id, platform")
                .eq("organization_id", membership.organization_id)
                .eq("status", "active");

              for (const ad of adSubs ?? []) {
                try {
                  await stripe.subscriptions.cancel(ad.stripe_subscription_id);
                  console.log(
                    "[stripe-invoice-webhook] Cascade-cancelled ad sub:",
                    ad.platform,
                    ad.stripe_subscription_id,
                  );
                } catch (cancelErr) {
                  console.error(
                    "[stripe-invoice-webhook] cascade cancel failed:",
                    cancelErr,
                  );
                }
              }
              if (adSubs && adSubs.length > 0) {
                await supabase
                  .from("ad_management_subscriptions")
                  .update({
                    status: "cancelled",
                    cancelled_at: new Date().toISOString(),
                    cancellation_reason: "tidywise_subscription_cancelled",
                  })
                  .eq("organization_id", membership.organization_id)
                  .eq("status", "active");

                await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
                  organizationName: "Ad Mgmt Cascade-Cancelled",
                  ownerEmail: email,
                  subscriptionType: `${adSubs.length} ad-mgmt sub(s) cancelled along with TidyWise sub`,
                }).catch(() => {});
              }
            }
          }
        }
      } catch (e) {
        console.error("[stripe-invoice-webhook] subscription.deleted handler error:", e);
      }
    }

    // ── PAYMENT FAILED ──────────────────────────────────────────────────────
    // Dunning event: card decline on a renewal invoice. Notify the platform
    // admin so they can reach out before Stripe gives up and cancels the
    // sub. Capture the failure in payment_evidence with a special marker so
    // the dispute path can later tell "we tried and failed" from "we never
    // charged". Without this, failed payments are invisible until the sub
    // is auto-cancelled by Stripe's dunning policy.
    if (event.type === "invoice.payment_failed") {
      try {
        const inv = event.data.object as Stripe.Invoice;
        const email = inv.customer_email || (inv.metadata as any)?.email || "unknown";
        const amount = ((inv.amount_due ?? 0) / 100).toFixed(2);
        const attemptCount = inv.attempt_count ?? 0;
        const nextAttempt = inv.next_payment_attempt
          ? new Date(inv.next_payment_attempt * 1000).toLocaleString("en-US", {
              timeZone: "America/New_York",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "no further attempts";

        await sendAdminNotification(supabaseUrl, supabaseServiceKey, {
          organizationName: "PAYMENT FAILED",
          ownerEmail: email,
          subscriptionType: `Renewal failed (attempt ${attemptCount}) • $${amount} ${inv.currency.toUpperCase()} • next try: ${nextAttempt} • invoice ${inv.id}`,
        }).catch((e) =>
          console.error("[stripe-invoice-webhook] payment_failed alert failed", e),
        );
      } catch (e) {
        console.error("[stripe-invoice-webhook] payment_failed handler error:", e);
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

/**
 * Resolve the TidyWise organization for a Stripe subscription by looking up
 * the customer's email → profile → org_memberships. Returns null when the
 * subscription is for an ad-management retainer (those don't grant TidyWise
 * access) or when no matching org can be found.
 */
async function resolveOrgIdForSubscription(
  supabase: any,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const meta = (subscription.metadata ?? {}) as Record<string, string>;
  if (meta.purpose === "tidywise_ad_management") return null;
  if (meta.organization_id) return meta.organization_id;

  try {
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    const email = (customer as Stripe.Customer).email?.toLowerCase();
    if (!email) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile?.id) return null;
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("organization_id")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();
    return membership?.organization_id ?? null;
  } catch (e) {
    console.error("[stripe-invoice-webhook] resolveOrgIdForSubscription failed:", e);
    return null;
  }
}

/**
 * Upsert a row into public.stripe_subscriptions. This is the source of truth
 * that has_active_subscription() reads to decide whether an org may create
 * bookings / customers / invoices. Called on subscription created/updated/
 * deleted and on invoice.paid.
 */
async function upsertStripeSubscription(
  supabase: any,
  orgId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  const meta = (subscription.metadata ?? {}) as Record<string, string>;

  const currentPeriodEndSec = (subscription as any).current_period_end as number | undefined;
  const trialEndSec = (subscription as any).trial_end as number | undefined;

  const row = {
    organization_id: orgId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: subscription.customer as string,
    stripe_price_id: price?.id ?? null,
    status: subscription.status,
    plan: (meta.tidywise_plan as string | undefined) ?? null,
    billing_interval: price?.recurring?.interval ?? null,
    current_period_end: currentPeriodEndSec
      ? new Date(currentPeriodEndSec * 1000).toISOString()
      : null,
    cancel_at_period_end: !!subscription.cancel_at_period_end,
    trial_end: trialEndSec ? new Date(trialEndSec * 1000).toISOString() : null,
    metadata: meta,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("stripe_subscriptions")
    .upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) {
    console.error("[stripe-invoice-webhook] stripe_subscriptions upsert failed:", error);
  } else {
    console.log("[stripe-invoice-webhook] stripe_subscriptions upserted", {
      orgId,
      subId: subscription.id,
      status: subscription.status,
    });
  }
}

serve(handler);
