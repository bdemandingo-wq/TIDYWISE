import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLATFORM_ADMIN_EMAIL = "support@tidywisecleaning.com";
const FREE_ACCOUNTS = new Set([
  "support@tidywisecleaning.com",
  "applereview@tidywise.com",
  "info@openarmscleaning.com",
]);

function normalizeEmail(email: string | null | undefined): string | null {
  return email ? email.trim().toLowerCase() : null;
}

function resolveSubscriptionStatus(email: string | null | undefined, status: string): string {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && FREE_ACCOUNTS.has(normalizedEmail)) {
    return "active";
  }

  return status;
}

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

    // Enrich signups with organization names via org_memberships AND staff table
    const enrichedSignups = [];
    if (recentSignups && recentSignups.length > 0) {
      const userIds = recentSignups.map(s => s.id);
      
      // Check org_memberships (owners/admins)
      const { data: memberships } = await supabaseClient
        .from('org_memberships')
        .select('user_id, role, organization:organizations(id, name)')
        .in('user_id', userIds);

      // Check staff table (staff/cleaners who signed up)
      const { data: staffRecords } = await supabaseClient
        .from('staff')
        .select('user_id, name, organization_id, organization:organizations(id, name)')
        .in('user_id', userIds);

      const orgMap = new Map<string, { org_name: string; org_id: string; role: string }>();
      
      // Map from org_memberships first (owners/admins)
      if (memberships) {
        for (const m of memberships) {
          const org = m.organization as any;
          if (org && !orgMap.has(m.user_id)) {
            orgMap.set(m.user_id, { org_name: org.name, org_id: org.id, role: m.role });
          }
        }
      }
      
      // Fill gaps from staff table (cleaners/staff who aren't in org_memberships)
      if (staffRecords) {
        for (const s of staffRecords) {
          if (s.user_id && !orgMap.has(s.user_id)) {
            const org = s.organization as any;
            if (org) {
              orgMap.set(s.user_id, { org_name: org.name, org_id: org.id, role: 'staff' });
            }
          }
        }
      }

      for (const signup of recentSignups) {
        const orgInfo = orgMap.get(signup.id);
        enrichedSignups.push({
          ...signup,
          org_name: orgInfo?.org_name || null,
          org_id: orgInfo?.org_id || null,
          role: orgInfo?.role || null,
        });
      }
    }

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
          // Get customer details first so any account overrides can apply to metrics and badges
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

          const resolvedStatus = resolveSubscriptionStatus(customerEmail, sub.status);

          if (resolvedStatus === 'active') activeSubscriptions++;
          if (resolvedStatus === 'trialing') trialSubscriptions++;
          if (resolvedStatus === 'canceled') canceledSubscriptions++;
          
          subscriptionList.push({
            id: sub.id,
            customer_email: customerEmail,
            status: resolvedStatus,
            created: safeFormatDate(sub.created),
            current_period_end: safeFormatDate(sub.current_period_end),
          });
          
          if (customerEmail !== 'Unknown' && !subscriberEmails.has(customerEmail)) {
            subscriberEmails.add(customerEmail);
            totalSubscribers++;
            
            if (sub.created >= thirtyDaysAgoTimestamp) {
              recentSubscribers++;
            }
            
            subscribersList.push({
              id: customerId,
              email: customerEmail,
              name: customerName,
              created: safeFormatDate(customerCreated),
              subscriptionStatus: resolvedStatus,
              subscriptionCreated: safeFormatDate(sub.created),
              subscriptionId: sub.id,
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
        recent: enrichedSignups || [],
        last30Days: enrichedSignups?.length || 0,
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
