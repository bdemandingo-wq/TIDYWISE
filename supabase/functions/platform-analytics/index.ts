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

    // Get subscription data - ONLY TidyWise CRM subscribers (filter by product ID)
    // TIDYWISE Pro Subscription product ID - only count these as CRM subscribers
    const TIDYWISE_CRM_PRODUCT_ID = "prod_Tg3zSKe9hRHLZy";
    
    let activeSubscriptions = 0;
    let trialSubscriptions = 0;
    let canceledSubscriptions = 0;
    let subscriptionList: any[] = [];
    let subscribersList: any[] = [];
    let totalSubscribers = 0;
    let recentSubscribers = 0;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      console.log("[PLATFORM-ANALYTICS] Fetching Stripe subscription data...");
      console.log("[PLATFORM-ANALYTICS] Filtering for TidyWise CRM product:", TIDYWISE_CRM_PRODUCT_ID);
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const thirtyDaysAgoTimestamp = Math.floor(thirtyDaysAgo.getTime() / 1000);
      
      try {
        // Get all subscriptions (including all statuses to show full picture)
        const allSubscriptions = await stripe.subscriptions.list({ 
          limit: 100,
          status: 'all' // Get all statuses: active, trialing, canceled, etc.
        });
        console.log("[PLATFORM-ANALYTICS] Found total subscriptions:", allSubscriptions.data.length);
        
        // Filter to only TidyWise CRM subscriptions
        const crmSubscriptions = allSubscriptions.data.filter((sub: Stripe.Subscription) => {
          const productId = sub.items.data[0]?.price?.product;
          return productId === TIDYWISE_CRM_PRODUCT_ID;
        });
        console.log("[PLATFORM-ANALYTICS] Filtered to CRM subscriptions:", crmSubscriptions.length);
        
        // Track unique customers with subscriptions
        const subscriberEmails = new Set<string>();
        
        for (const sub of crmSubscriptions) {
          if (sub.status === 'active') activeSubscriptions++;
          if (sub.status === 'trialing') trialSubscriptions++;
          if (sub.status === 'canceled') canceledSubscriptions++;
          
          // Get customer details
          let customerEmail = 'Unknown';
          let customerName = null;
          let customerId = '';
          let customerCreated = 0;
          
          if (sub.customer) {
            try {
              customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
              const customer = await stripe.customers.retrieve(customerId);
              if (!customer.deleted && 'email' in customer && customer.email) {
                customerEmail = customer.email;
                customerName = customer.name || null;
                customerCreated = customer.created;
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
          
          // Add to subscribers list (only once per email, prioritize active subscriptions)
          if (customerEmail !== 'Unknown' && !subscriberEmails.has(customerEmail)) {
            subscriberEmails.add(customerEmail);
            totalSubscribers++;
            
            // Check if recent subscriber (last 30 days)
            if (sub.created >= thirtyDaysAgoTimestamp) {
              recentSubscribers++;
            }
            
            subscribersList.push({
              id: customerId,
              email: customerEmail,
              name: customerName,
              created: safeFormatDate(customerCreated),
              subscriptionStatus: sub.status,
              subscriptionCreated: safeFormatDate(sub.created),
              source: 'tidywise_subscriber',
            });
          }
        }

        console.log("[PLATFORM-ANALYTICS] Total TidyWise subscribers:", totalSubscribers);
        
        // Sort by subscription created date (most recent first)
        subscribersList.sort((a, b) => {
          const dateA = a.subscriptionCreated !== 'Unknown' ? new Date(a.subscriptionCreated).getTime() : 0;
          const dateB = b.subscriptionCreated !== 'Unknown' ? new Date(b.subscriptionCreated).getTime() : 0;
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
      subscribers: {
        total: totalSubscribers,
        recent: subscribersList.slice(0, 100),
        last30Days: recentSubscribers,
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
