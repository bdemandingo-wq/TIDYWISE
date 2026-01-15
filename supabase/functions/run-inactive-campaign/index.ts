import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InactiveCustomer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  organization_id: string;
  last_booking_date: string | null;
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

    const { organizationId, campaignId, daysInactive = 30, testMode = false } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[run-inactive-campaign] Starting for org: ${organizationId}, days: ${daysInactive}`);

    // Get organization SMS settings
    const { data: smsSettings, error: smsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .single();

    if (smsError || !smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
      console.error("[run-inactive-campaign] SMS not configured:", smsError);
      return new Response(
        JSON.stringify({ success: false, error: "SMS settings not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings.sms_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "SMS is disabled for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get campaign template if provided
    let messageTemplate = "Hi {first_name}! We miss you at {company_name}. It's been a while since your last clean. Book now and get 15% off! Reply STOP to opt out.";
    
    if (campaignId) {
      const { data: campaign } = await supabase
        .from('automated_campaigns')
        .select('body, name')
        .eq('id', campaignId)
        .eq('organization_id', organizationId)
        .single();
      
      if (campaign?.body) {
        messageTemplate = campaign.body;
      }
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

    // Get customers with phone numbers who haven't booked recently
    // EXCLUDE customers who have opted out of marketing
    const { data: allCustomers, error: customersError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, marketing_status')
      .eq('organization_id', organizationId)
      .eq('marketing_status', 'active') // Only active marketing status
      .not('phone', 'is', null);

    if (customersError) {
      console.error("[run-inactive-campaign] Error fetching customers:", customersError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch customers" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[run-inactive-campaign] Found ${allCustomers?.length || 0} active marketing customers with phones`);

    // Get last booking date for each customer
    const inactiveCustomers: InactiveCustomer[] = [];

    for (const customer of allCustomers || []) {
      const { data: lastBooking } = await supabase
        .from('bookings')
        .select('scheduled_at')
        .eq('customer_id', customer.id)
        .eq('organization_id', organizationId)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .single();

      const lastBookingDate = lastBooking?.scheduled_at;
      
      // Customer is inactive if no bookings or last booking is before cutoff
      if (!lastBookingDate || new Date(lastBookingDate) < cutoffDate) {
        inactiveCustomers.push({
          ...customer,
          organization_id: organizationId,
          last_booking_date: lastBookingDate || null
        });
      }
    }

    console.log(`[run-inactive-campaign] Found ${inactiveCustomers.length} inactive customers`);

    // Filter out customers who already received this campaign
    let customersToContact = inactiveCustomers;
    
    if (campaignId) {
      const { data: previousSends } = await supabase
        .from('campaign_sms_sends')
        .select('customer_id')
        .eq('campaign_id', campaignId);

      const sentCustomerIds = new Set(previousSends?.map(s => s.customer_id) || []);
      customersToContact = inactiveCustomers.filter(c => !sentCustomerIds.has(c.id));
    }

    console.log(`[run-inactive-campaign] ${customersToContact.length} customers to contact after filtering`);

    if (testMode) {
      // In test mode, just return the list without sending
      return new Response(
        JSON.stringify({ 
          success: true, 
          testMode: true,
          inactiveCount: inactiveCustomers.length,
          toContactCount: customersToContact.length,
          customers: customersToContact.slice(0, 10) // Preview first 10
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send SMS to each inactive customer
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const customer of customersToContact) {
      try {
        // Personalize message
        const personalizedMessage = messageTemplate
          .replace(/{first_name}/g, customer.first_name)
          .replace(/{last_name}/g, customer.last_name)
          .replace(/{company_name}/g, companyName);

        // Format phone number
        let toPhone = customer.phone.replace(/\D/g, '');
        if (!toPhone.startsWith('1') && toPhone.length === 10) {
          toPhone = '1' + toPhone;
        }
        toPhone = '+' + toPhone;

        // Send via OpenPhone
        const response = await fetch('https://api.openphone.com/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': smsSettings.openphone_api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: smsSettings.openphone_phone_number_id,
            to: [toPhone],
            content: personalizedMessage,
          }),
        });

        if (response.ok) {
          sentCount++;
          
          // Record the send
          if (campaignId) {
            await supabase
              .from('campaign_sms_sends')
              .insert({
                campaign_id: campaignId,
                customer_id: customer.id,
                organization_id: organizationId,
                phone_number: toPhone,
                message_content: personalizedMessage,
                status: 'sent'
              });
          }
        } else {
          const errorData = await response.json();
          console.error(`[run-inactive-campaign] Failed to send to ${customer.id}:`, errorData);
          failedCount++;
          errors.push(`${customer.first_name}: ${errorData.message || 'Unknown error'}`);
        }

        // Rate limiting - small delay between sends
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`[run-inactive-campaign] Error sending to ${customer.id}:`, error);
        failedCount++;
      }
    }

    // Update campaign last_run_at if provided
    if (campaignId) {
      await supabase
        .from('automated_campaigns')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', campaignId);
    }

    console.log(`[run-inactive-campaign] Complete. Sent: ${sentCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentCount, 
        failedCount,
        totalInactive: inactiveCustomers.length,
        errors: errors.slice(0, 5) // Return first 5 errors
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[run-inactive-campaign] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
