import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { organizationId, testMode = false, message, hoursThreshold = 1 } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: "Organization ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[followup-abandoned-booking] Starting for org: ${organizationId}, threshold: ${hoursThreshold}h`);

    // Get SMS settings
    const { data: smsSettings } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!smsSettings?.sms_enabled || !smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      return new Response(
        JSON.stringify({ success: false, error: "SMS not configured or disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get business settings
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('company_name')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = businessSettings?.company_name || 'Our Company';

    // Find abandoned bookings with phone numbers that haven't been followed up
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursThreshold);

    const { data: abandonedBookings, error: fetchError } = await supabase
      .from('abandoned_bookings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('followup_sent', false)
      .eq('converted', false)
      .not('phone', 'is', null)
      .lt('created_at', cutoffTime.toISOString())
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error("[followup-abandoned-booking] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch abandoned bookings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[followup-abandoned-booking] Found ${abandonedBookings?.length || 0} abandoned bookings to follow up`);

    if (testMode) {
      return new Response(
        JSON.stringify({
          success: true,
          testMode: true,
          abandonedCount: abandonedBookings?.length || 0,
          bookings: (abandonedBookings || []).slice(0, 10).map(b => ({
            id: b.id,
            first_name: b.first_name,
            phone: b.phone,
            step_reached: b.step_reached,
            created_at: b.created_at,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const defaultMessage = `Hi {first_name}! We noticed you started booking with ${companyName} but didn't finish. We'd love to help you complete your reservation! Reply to this message or visit our booking page. Reply STOP to opt out.`;
    const messageTemplate = message || defaultMessage;

    let sentCount = 0;
    let failedCount = 0;
    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

    for (const booking of abandonedBookings || []) {
      try {
        const personalizedMessage = messageTemplate
          .replace(/{first_name}/g, booking.first_name || 'there')
          .replace(/{company_name}/g, companyName);

        let toPhone = booking.phone.replace(/\D/g, '');
        if (!toPhone.startsWith('1') && toPhone.length === 10) {
          toPhone = '1' + toPhone;
        }
        toPhone = '+' + toPhone;

        const response = await fetch('https://api.openphone.com/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
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
          await supabase
            .from('abandoned_bookings')
            .update({ followup_sent: true, followup_sent_at: new Date().toISOString() })
            .eq('id', booking.id);
        } else {
          const errorData = await response.text();
          console.error(`[followup-abandoned-booking] SMS failed for ${booking.id}:`, errorData);
          failedCount++;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`[followup-abandoned-booking] Error for ${booking.id}:`, error);
        failedCount++;
      }
    }

    console.log(`[followup-abandoned-booking] Complete. Sent: ${sentCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({ success: true, sentCount, failedCount, totalAbandoned: abandonedBookings?.length || 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[followup-abandoned-booking] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
