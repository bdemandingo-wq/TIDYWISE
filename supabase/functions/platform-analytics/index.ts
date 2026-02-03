import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";

// Safe date formatter
function safeFormatDate(timestamp: number | undefined | null): string {
  if (!timestamp || isNaN(timestamp)) return 'Unknown';
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch {
    return 'Unknown';
  }
}

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
    console.log("[PLATFORM-ANALYTICS] Starting...");
    
    // Verify the user is the platform admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Authentication error: Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const userEmail = claimsData.claims.email as string | undefined;
    console.log("[PLATFORM-ANALYTICS] User email:", userEmail);
    
    if (!userEmail || userEmail !== PLATFORM_ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Unauthorized: Platform admin access only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get total signups (profiles count)
    const { count: totalSignups } = await supabaseClient
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    console.log("[PLATFORM-ANALYTICS] Total signups:", totalSignups);

    // Get recent signups (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: recentSignups } = await supabaseClient
      .from('profiles')
      .select('id, email, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    // Get organizations count
    const { count: totalOrganizations } = await supabaseClient
      .from('organizations')
      .select('*', { count: 'exact', head: true });
    console.log("[PLATFORM-ANALYTICS] Total organizations:", totalOrganizations);

    // Get recent organizations
    const { data: recentOrganizations } = await supabaseClient
      .from('organizations')
      .select('id, name, created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    // Get subscription data and ALL customers from Stripe
    let activeSubscriptions = 0;
    let trialSubscriptions = 0;
    let canceledSubscriptions = 0;
    let subscriptionList: any[] = [];
    let stripeCustomersList: any[] = [];
    let totalStripeCustomers = 0;
    let recentStripeCustomers = 0;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      console.log("[PLATFORM-ANALYTICS] Fetching Stripe data...");
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      
      try {
        // Get all subscriptions
        const subscriptions = await stripe.subscriptions.list({ limit: 100 });
        console.log("[PLATFORM-ANALYTICS] Found subscriptions:", subscriptions.data.length);
        
        for (const sub of subscriptions.data) {
          if (sub.status === 'active') activeSubscriptions++;
          if (sub.status === 'trialing') trialSubscriptions++;
          if (sub.status === 'canceled') canceledSubscriptions++;
          
          // Get customer email safely
          let customerEmail = 'Unknown';
          if (sub.customer) {
            try {
              const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
              const customer = await stripe.customers.retrieve(customerId);
              if (!customer.deleted && 'email' in customer && customer.email) {
                customerEmail = customer.email;
              }
            } catch (e) {
              console.log("[PLATFORM-ANALYTICS] Could not fetch customer:", e);
            }
          }
          
          subscriptionList.push({
            id: sub.id,
            customer_email: customerEmail,
            status: sub.status,
            created: safeFormatDate(sub.created),
            current_period_end: safeFormatDate(sub.current_period_end),
          });
        }

        // Get ALL Stripe customers (this captures everyone who signed up via Stripe)
        console.log("[PLATFORM-ANALYTICS] Fetching all Stripe customers...");
        let hasMore = true;
        let startingAfter: string | undefined = undefined;
        const thirtyDaysAgoTimestamp = Math.floor(thirtyDaysAgo.getTime() / 1000);

        while (hasMore) {
          const params: any = { limit: 100 };
          if (startingAfter) params.starting_after = startingAfter;
          
          const customers = await stripe.customers.list(params);
          
          for (const customer of customers.data) {
            if (!customer.deleted && customer.email) {
              totalStripeCustomers++;
              
              const createdAt = safeFormatDate(customer.created);
              
              // Check if recent (last 30 days)
              if (customer.created >= thirtyDaysAgoTimestamp) {
                recentStripeCustomers++;
              }
              
              stripeCustomersList.push({
                id: customer.id,
                email: customer.email,
                name: customer.name || null,
                created: createdAt,
                source: 'stripe',
              });
            }
          }
          
          hasMore = customers.has_more;
          if (customers.data.length > 0) {
            startingAfter = customers.data[customers.data.length - 1].id;
          } else {
            hasMore = false;
          }
          
          // Safety cap at 1000 customers to prevent timeout
          if (totalStripeCustomers >= 1000) {
            console.log("[PLATFORM-ANALYTICS] Hit customer limit, stopping pagination");
            break;
          }
        }

        console.log("[PLATFORM-ANALYTICS] Total Stripe customers:", totalStripeCustomers);
        
        // Sort by created date (most recent first)
        stripeCustomersList.sort((a, b) => {
          const dateA = a.created !== 'Unknown' ? new Date(a.created).getTime() : 0;
          const dateB = b.created !== 'Unknown' ? new Date(b.created).getTime() : 0;
          return dateB - dateA;
        });
        
      } catch (stripeError) {
        console.error("[PLATFORM-ANALYTICS] Stripe error:", stripeError);
      }
    } else {
      console.log("[PLATFORM-ANALYTICS] No Stripe key found");
    }

    console.log("[PLATFORM-ANALYTICS] Returning data...");
    return new Response(JSON.stringify({
      signups: {
        total: totalSignups || 0,
        recent: recentSignups || [],
        last30Days: recentSignups?.length || 0,
      },
      organizations: {
        total: totalOrganizations || 0,
        recent: recentOrganizations || [],
        last30Days: recentOrganizations?.length || 0,
      },
      subscriptions: {
        active: activeSubscriptions,
        trialing: trialSubscriptions,
        canceled: canceledSubscriptions,
        list: subscriptionList.slice(0, 50),
      },
      stripeCustomers: {
        total: totalStripeCustomers,
        recent: stripeCustomersList.slice(0, 100), // Most recent 100
        last30Days: recentStripeCustomers,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[PLATFORM-ANALYTICS] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: error instanceof Error && error.message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
