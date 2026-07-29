import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyOrgAccess } from "../_shared/verify-org-access.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

interface InactiveCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  organization_id: string;
  last_booking_date: string | null;
  already_received?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[run-inactive-campaign] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      organizationId,
      campaignId,
      daysInactive = 30,
      testMode = false,
      message,
      targetAudience = 'inactive_clients',
      excludeAlreadyReceived = false,
      excludeRecentDays = 0,
      onlyAfterDate = null,
      recipientCustomerIds = null,
      throttleSeconds: throttleSecondsBody = null,
      scheduledAt: scheduledAtBody = null,
    } = body;


    // Auth gate: allow either cron secret (scheduled runs) OR an authenticated
    // admin/owner of the target organization (manual runs from the admin UI).
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedCronSecret = req.headers.get("x-cron-secret");
    const isCronCall = !!cronSecret && providedCronSecret === cronSecret;

    if (!isCronCall) {
      if (!organizationId) {
        return new Response(
          JSON.stringify({ success: false, error: "Organization ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const authResult = await verifyOrgAccess(req, organizationId, { requireAdmin: true });
      if (!authResult.ok) {
        return new Response(
          JSON.stringify({ success: false, error: authResult.error }),
          { status: authResult.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[run-inactive-campaign] Starting for org: ${organizationId}, days: ${daysInactive}, audience: ${targetAudience}`);

    // Check if winback automation is enabled (for automated 60-day campaigns)
    if (daysInactive >= 60) {
      const { data: automationSetting } = await supabase
        .from('organization_automations')
        .select('is_enabled')
        .eq('organization_id', organizationId)
        .eq('automation_type', 'winback_60day')
        .maybeSingle();

      if (automationSetting && !automationSetting.is_enabled) {
        return new Response(
          JSON.stringify({ success: false, error: "Win-back automation disabled for this organization" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get organization SMS settings
    const { data: smsSettings, error: smsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .single();

    if (!testMode && (smsError || !smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id)) {
      console.error("[run-inactive-campaign] SMS not configured:", smsError);
      return new Response(
        JSON.stringify({ success: false, error: "SMS settings not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!testMode && smsSettings && !smsSettings.sms_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "SMS is disabled for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get campaign template if provided, otherwise use provided message
    let messageTemplate = message || "Hi {first_name}! We miss you at {company_name}. It's been a while since your last clean. Book now and get 15% off! Reply STOP to opt out.";
    let campaignType = 'inactive_customer';
    let campaignThrottle: number | null = null;
    if (campaignId) {
      const { data: campaign } = await supabase
        .from('automated_campaigns')
        .select('body, name, type, throttle_seconds')
        .eq('id', campaignId)
        .eq('organization_id', organizationId)
        .single();
      
      if (campaign?.body) {
        messageTemplate = campaign.body;
      }
      if (campaign?.type) {
        campaignType = campaign.type;
      }
      if (campaign?.throttle_seconds != null) {
        campaignThrottle = campaign.throttle_seconds;
      }
    }

    const throttleSeconds = throttleSecondsBody ?? campaignThrottle ?? 60;
    const scheduledAt: string | null = scheduledAtBody ?? null;

    // Explicit recipient list: skip audience resolution entirely.
    if (!testMode && Array.isArray(recipientCustomerIds) && recipientCustomerIds.length > 0) {
      const { data: explicitCustomers, error: explicitErr } = await supabase
        .from('customers')
        .select('id, first_name, last_name, phone')
        .eq('organization_id', organizationId)
        .eq('marketing_status', 'active')
        .not('phone', 'is', null)
        .in('id', recipientCustomerIds)
        .order('id', { ascending: true });

      if (explicitErr) {
        console.error('[run-inactive-campaign] Failed to load explicit recipients:', explicitErr);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to load recipients: ${explicitErr.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return await createRunAndEnqueue({
        supabase,
        organizationId,
        campaignId: campaignId || null,
        messageTemplate,
        recipients: explicitCustomers || [],
        throttleSeconds,
        scheduledAt,
        corsHeaders,
      });
    }

    // Get business settings for company name
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('company_name')
      .eq('organization_id', organizationId)
      .single();

    const companyName = businessSettings?.company_name || 'Your Cleaning Service';


    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    // Get ALL customers — paginate to avoid the 1000-row default limit
    let allCustomers: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
      let query = supabase
        .from('customers')
        .select('id, first_name, last_name, phone, email, marketing_status, customer_status, created_at')
        .eq('organization_id', organizationId)
        .eq('marketing_status', 'active')
        .not('phone', 'is', null)
        // Unique tiebreaker required: .range() paging is only deterministic
        // with a total ordering. Do not remove.
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (targetAudience === 'cancelled_clients') {
        query = query.eq('customer_status', 'inactive');
      }

      // Filter by creation date if onlyAfterDate specified
      if (onlyAfterDate) {
        query = query.gte('created_at', onlyAfterDate);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[run-inactive-campaign] Error fetching customers page:", error);
        // Abort the run: a partial customer list must never become the campaign audience.
        return new Response(
          JSON.stringify({ error: `Failed to fetch customers: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!data || data.length === 0) break;
      allCustomers = allCustomers.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    console.log(`[run-inactive-campaign] Found ${allCustomers.length} eligible customers`);

    // Filter based on audience type
    const targetCustomers: InactiveCustomer[] = [];

    for (const customer of allCustomers) {
      const { data: lastBooking } = await supabase
        .from('bookings')
        .select('scheduled_at, status')
        .eq('customer_id', customer.id)
        .eq('organization_id', organizationId)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastBookingDate = lastBooking?.scheduled_at;

      if (targetAudience === 'active_clients' || targetAudience === 'all_customers') {
        if (targetAudience === 'active_clients') {
          if (lastBookingDate && new Date(lastBookingDate) >= cutoffDate) {
            targetCustomers.push({
              ...customer,
              organization_id: organizationId,
              last_booking_date: lastBookingDate || null,
            });
          }
        } else {
          targetCustomers.push({
            ...customer,
            organization_id: organizationId,
            last_booking_date: lastBookingDate || null,
          });
        }
      } else if (targetAudience === 'cancelled_clients') {
        targetCustomers.push({
          ...customer,
          organization_id: organizationId,
          last_booking_date: lastBookingDate || null,
        });
      } else if (targetAudience === 'leads') {
        // Leads: no bookings at all
        if (!lastBookingDate) {
          targetCustomers.push({
            ...customer,
            organization_id: organizationId,
            last_booking_date: null,
          });
        }
      } else {
        // Inactive: no bookings or last booking before cutoff
        if (!lastBookingDate || new Date(lastBookingDate) < cutoffDate) {
          targetCustomers.push({
            ...customer,
            organization_id: organizationId,
            last_booking_date: lastBookingDate || null,
          });
        }
      }
    }

    console.log(`[run-inactive-campaign] Found ${targetCustomers.length} target customers`);

    // Build set of customers who already received this campaign.
    //
    // This used to select every campaign_sms_sends row for the campaign with
    // no pagination, which silently truncated at PostgREST's 1000-row cap.
    // A truncated exclusion list FAILS OPEN — customers past row 1000 look
    // like they were never messaged and get the campaign again. Now that the
    // table keeps one row per message rather than one per person, that cap
    // would be reached several times sooner.
    //
    // Instead: an EXISTS-style check scoped to the candidate batch only.
    // We ask "which of THESE customers already got it" in chunks, so the
    // result set is bounded by the audience size, not by send history.
    let sentCustomerIds = new Set<string>();
    if (campaignId || excludeAlreadyReceived) {
      const filterCampaignId = campaignId;
      if (filterCampaignId) {
        const candidateIds = targetCustomers.map(c => c.id).filter(Boolean);
        const CHUNK = 200;
        for (let i = 0; i < candidateIds.length; i += CHUNK) {
          const chunk = candidateIds.slice(i, i + CHUNK);
          const { data: previousSends, error: previousSendsErr } = await supabase
            .from('campaign_sms_sends')
            .select('customer_id')
            .eq('campaign_id', filterCampaignId)
            .in('customer_id', chunk);
          if (previousSendsErr) {
            // Fail closed: an unreadable exclusion list must not be treated
            // as "nobody was sent to yet" — that's how this campaign would
            // re-message everyone who already got it.
            console.error('[run-inactive-campaign] Failed to load previous sends, aborting to avoid duplicate sends:', previousSendsErr);
            return new Response(
              JSON.stringify({ success: false, error: 'Could not verify prior sends for this campaign, please retry' }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          (previousSends || []).forEach(s => { if (s.customer_id) sentCustomerIds.add(s.customer_id); });
        }
      }
    }

    // Build set of customers who received ANY campaign recently
    let recentlySentIds = new Set<string>();
    if (excludeRecentDays > 0) {
      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - excludeRecentDays);
      const { data: recentSends, error: recentSendsErr } = await supabase
        .from('campaign_sms_sends')
        .select('customer_id')
        .eq('organization_id', organizationId)
        .gte('sent_at', recentCutoff.toISOString());
      if (recentSendsErr) {
        console.error('[run-inactive-campaign] Failed to load recently-sent list, aborting to avoid duplicate sends:', recentSendsErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Could not verify recent sends, please retry' }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      (recentSends || []).forEach(s => { if (s.customer_id) recentlySentIds.add(s.customer_id); });
    }

    // Mark and filter
    const customersWithTags = targetCustomers.map(c => ({
      ...c,
      already_received: sentCustomerIds.has(c.id),
      recently_contacted: recentlySentIds.has(c.id),
    }));

    let customersToContact = customersWithTags.filter(c => {
      if (excludeAlreadyReceived && c.already_received) return false;
      if (excludeRecentDays > 0 && c.recently_contacted) return false;
      return true;
    });

    console.log(`[run-inactive-campaign] ${customersToContact.length} customers to contact after filtering`);

    if (testMode) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          testMode: true,
          inactiveCount: targetCustomers.length,
          toContactCount: customersToContact.length,
          excludedCount: targetCustomers.length - customersToContact.length,
          customers: customersWithTags, // Return ALL for preview, with tags
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enqueue-only: create the run and hand delivery to process-campaign-queue.
    return await createRunAndEnqueue({
      supabase,
      organizationId,
      campaignId: campaignId || null,
      messageTemplate,
      recipients: customersToContact,
      throttleSeconds,
      scheduledAt,
      corsHeaders,
    });


  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[run-inactive-campaign] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

/**
 * Normalises a raw phone to E.164, or returns null when it is unsendable.
 * Unsendable data must never be queued — it would fail 5 times and land in
 * the DLQ looking like a delivery failure.
 */
function normalizePhone(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) digits = '1' + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  if (/^0+$/.test(digits)) return null;
  return '+' + digits;
}

/**
 * Creates the campaign_runs row (with total_recipients set in the SAME INSERT —
 * the AFTER INSERT trigger arms the worker and it reads total_recipients on its
 * first tick) and enqueues one campaign_sms message per recipient.
 * Delivery, token substitution and tracking refs are the worker's job.
 */
async function createRunAndEnqueue({
  supabase,
  organizationId,
  campaignId,
  messageTemplate,
  recipients,
  throttleSeconds,
  scheduledAt,
  corsHeaders,
}: {
  supabase: any;
  organizationId: string;
  campaignId: string | null;
  messageTemplate: string;
  recipients: Array<{ id: string; first_name: string; last_name: string; phone: string }>;
  throttleSeconds: number;
  scheduledAt: string | null;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  // Drop unsendable phone numbers BEFORE the run is created so
  // total_recipients reflects what can actually be delivered.
  const sendable: Array<{ id: string; first_name: string; last_name: string; phone: string }> = [];
  const skippedInvalidPhoneIds: string[] = [];
  for (const c of recipients) {
    const normalized = normalizePhone(c.phone);
    if (!normalized) {
      skippedInvalidPhoneIds.push(c.id);
      continue;
    }
    sendable.push({ ...c, phone: normalized });
  }
  const skippedInvalidPhone = skippedInvalidPhoneIds.length;
  if (skippedInvalidPhone > 0) {
    console.warn(
      `[run-inactive-campaign] Skipping ${skippedInvalidPhone} recipient(s) with unsendable phone numbers:`,
      skippedInvalidPhoneIds.slice(0, 20)
    );
  }

  const totalRecipients = sendable.length;
  const base = scheduledAt ? new Date(scheduledAt) : new Date();
  const expiresAt = new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString();

  if (totalRecipients === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'No recipients with a sendable phone number',
        totalRecipients: 0,
        skippedInvalidPhone,
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: run, error: runErr } = await supabase
    .from('campaign_runs')
    .insert({
      campaign_id: campaignId,
      organization_id: organizationId,
      status: 'pending',
      throttle_seconds: throttleSeconds,
      scheduled_at: scheduledAt,
      expires_at: expiresAt,
      total_recipients: totalRecipients,
    })
    .select('id')
    .single();

  if (runErr || !run) {
    console.error('[run-inactive-campaign] Failed to create campaign run:', runErr);
    return new Response(
      JSON.stringify({ success: false, error: `Failed to create campaign run: ${runErr?.message || 'unknown'}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let enqueued = 0;
  for (const customer of sendable) {
    const toPhone = customer.phone;


    const { error: qErr } = await supabase.rpc('enqueue_email', {
      queue_name: 'campaign_sms',
      payload: {
        run_id: run.id,
        campaign_id: campaignId,
        organization_id: organizationId,
        customer_id: customer.id,
        phone: toPhone,
        first_name: customer.first_name,
        last_name: customer.last_name,
        message_template: messageTemplate,
      },
    });

    if (qErr) {
      console.error(`[run-inactive-campaign] Enqueue failed after ${enqueued} messages (run ${run.id}):`, qErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Enqueue failed after ${enqueued} of ${totalRecipients} messages: ${qErr.message}`,
          runId: run.id,
          enqueued,
          totalRecipients,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    enqueued++;
  }

  if (campaignId) {
    await supabase
      .from('automated_campaigns')
      .update({ last_run_at: new Date().toISOString() })
      .eq('id', campaignId);
  }

  console.log(`[run-inactive-campaign] Run ${run.id} enqueued ${enqueued}/${totalRecipients} recipients`);

  return new Response(
    JSON.stringify({ success: true, runId: run.id, totalRecipients, skippedInvalidPhone }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(handler);

