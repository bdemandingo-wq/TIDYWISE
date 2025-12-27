import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TIDYWISE Pro product ID
const PRO_PRODUCT_ID = "prod_Tg3zSKe9hRHLZy";

// Helper logging function
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("Missing Authorization header");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "").trim();

    // Basic sanity check to avoid treating anon keys / garbage as a user JWT
    if (!token || token.split(".").length !== 3) {
      logStep("Invalid auth token format");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    logStep("Authenticating user with token");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      logStep("Authentication failed", { message: userError.message });
      return new Response(
        JSON.stringify({ error: `Authentication error: ${userError.message}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }
    const user = userData.user;
    if (!user?.email) {
      logStep("User not authenticated or email not available");
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Bypass subscription check for owner account
    const FREE_ACCOUNTS = ["support@tidywisecleaning.com"];
    if (FREE_ACCOUNTS.includes(user.email.toLowerCase())) {
      logStep("Free account detected - bypassing subscription check", { email: user.email });
      return new Response(JSON.stringify({
        subscribed: true,
        trial_active: false,
        product_id: "owner_free",
        subscription_end: null,
        trial_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning unsubscribed state");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial_active: false,
        product_id: null,
        subscription_end: null,
        trial_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for active, trialing, or past_due subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 10,
    });
    
    const activeSubscription = subscriptions.data.find(
      (sub: any) => sub.status === "active" || sub.status === "trialing"
    );
    
    const pastDueSubscription = subscriptions.data.find(
      (sub: any) => sub.status === "past_due"
    );
    
    // If past_due, block access
    if (!activeSubscription && pastDueSubscription) {
      logStep("Subscription is past_due - blocking access");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial_active: false,
        product_id: null,
        subscription_end: null,
        trial_end: null,
        payment_failed: true,
        message: "Your subscription payment has failed. Please update your payment method to continue."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    if (!activeSubscription) {
      logStep("No active subscription found");
      return new Response(JSON.stringify({ 
        subscribed: false,
        trial_active: false,
        product_id: null,
        subscription_end: null,
        trial_end: null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const isTrialing = activeSubscription.status === "trialing";
    
    // Safely parse subscription end date
    let subscriptionEnd: string | null = null;
    if (activeSubscription.current_period_end && typeof activeSubscription.current_period_end === 'number') {
      try {
        subscriptionEnd = new Date(activeSubscription.current_period_end * 1000).toISOString();
      } catch (e) {
        logStep("Warning: Could not parse current_period_end", { value: activeSubscription.current_period_end });
      }
    }
    
    // Safely parse trial end date
    let trialEnd: string | null = null;
    if (activeSubscription.trial_end && typeof activeSubscription.trial_end === 'number') {
      try {
        trialEnd = new Date(activeSubscription.trial_end * 1000).toISOString();
      } catch (e) {
        logStep("Warning: Could not parse trial_end", { value: activeSubscription.trial_end });
      }
    }
    
    const productId = activeSubscription.items.data[0]?.price?.product;
    
    logStep("Active subscription found", { 
      subscriptionId: activeSubscription.id, 
      status: activeSubscription.status,
      trialEnd,
      subscriptionEnd
    });

    return new Response(JSON.stringify({
      subscribed: true,
      trial_active: isTrialing,
      product_id: productId,
      subscription_end: subscriptionEnd,
      trial_end: trialEnd
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
