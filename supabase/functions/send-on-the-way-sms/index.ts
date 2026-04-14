import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OnTheWayRequest {
  bookingId: string;
  staffId: string;
  etaMinutes?: number;
  trackingToken?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[send-on-the-way-sms] Missing Supabase configuration");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { bookingId, staffId, etaMinutes, trackingToken } = await req.json() as OnTheWayRequest;

    if (!bookingId || !staffId) {
      console.error("[send-on-the-way-sms] Missing bookingId or staffId");
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplication: Check if an "on the way" SMS was already sent for this booking
    const { data: existingLog } = await supabase
      .from('booking_reminder_log')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('reminder_type', 'on_the_way')
      .limit(1);

    if (existingLog && existingLog.length > 0) {
      console.log(`[send-on-the-way-sms] Already sent for booking ${bookingId}, skipping duplicate`);
      return new Response(
        JSON.stringify({ success: true, deduplicated: true, message: "On-the-way notification already sent for this booking" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch booking with customer info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_number,
        scheduled_at,
        organization_id,
        address,
        city,
        state,
        customer:customers(
          first_name,
          last_name,
          phone
        )
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error("[send-on-the-way-sms] Failed to fetch booking:", bookingError);
      return new Response(
        JSON.stringify({ success: false, error: "Booking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!booking.organization_id) {
      console.error("[send-on-the-way-sms] Booking has no organization_id");
      return new Response(
        JSON.stringify({ success: false, error: "Organization not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle customer as array from join
    const customerData = booking.customer as unknown;
    const customer = Array.isArray(customerData) ? customerData[0] : customerData;
    const typedCustomer = customer as { first_name: string; last_name: string; phone: string | null } | null;
    
    if (!typedCustomer?.phone) {
      console.log("[send-on-the-way-sms] Customer has no phone number");
      return new Response(
        JSON.stringify({ success: false, error: "Customer has no phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch staff info
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('name')
      .eq('id', staffId)
      .single();

    if (staffError || !staff) {
      console.error("[send-on-the-way-sms] Failed to fetch staff:", staffError);
      return new Response(
        JSON.stringify({ success: false, error: "Staff not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled, notify_admin_on_the_way, notify_client_on_the_way, notify_client_distance_eta')
      .eq('organization_id', booking.organization_id)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-on-the-way-sms] Error fetching SMS settings:", settingsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch SMS settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings?.sms_enabled) {
      console.log("[send-on-the-way-sms] SMS disabled for organization");
      return new Response(
        JSON.stringify({ success: false, error: "SMS notifications are disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-on-the-way-sms] OpenPhone not configured");
      return new Response(
        JSON.stringify({ success: false, error: "OpenPhone not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get business settings for company name, admin phone, and app URL
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('company_name, company_phone, app_url')
      .eq('organization_id', booking.organization_id)
      .maybeSingle();

    const companyName = businessSettings?.company_name || 'Your cleaning service';
    const adminPhone = businessSettings?.company_phone;

    // Resolve the app URL for tracking link
    let appBaseUrl = businessSettings?.app_url || Deno.env.get("APP_URL") || Deno.env.get("PROJECT_URL") || '';
    appBaseUrl = appBaseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!appBaseUrl) {
      appBaseUrl = 'jointidywise.com';
    }

    // Check if distance/ETA should be included in client SMS
    const includeClientEta = smsSettings.notify_client_distance_eta !== false;

    // Build customer SMS message
    let customerMessage = `🚗 ${staff.name} from ${companyName} is on the way to your appointment!`;
    
    if (includeClientEta && etaMinutes && etaMinutes > 0) {
      customerMessage += `\n\nEstimated arrival: ~${etaMinutes} minutes`;
    }

    // Add tracking link if available
    if (trackingToken) {
      customerMessage += `\n\n📍 Track your cleaner live:\nhttps://${appBaseUrl}/track/${trackingToken}`;
    }
    
    customerMessage += `\n\nBooking #${booking.booking_number}`;
    
    if (booking.address) {
      customerMessage += `\n📍 ${booking.address}${booking.city ? `, ${booking.city}` : ''}`;
    }
    
    customerMessage += `\n\nQuestions? Reply to this message.`;

    // Build admin notification message
    const adminMessage = `📍 ${staff.name} is on the way to Job #${booking.booking_number}\n\n` +
      `Customer: ${typedCustomer.first_name} ${typedCustomer.last_name}\n` +
      `Address: ${booking.address || 'N/A'}${booking.city ? `, ${booking.city}` : ''}\n` +
      (etaMinutes ? `ETA: ~${etaMinutes} min` : '');

    // Helper function to format phone numbers
    const formatPhoneNumber = (phone: string): string => {
      let formatted = phone.replace(/\D/g, '');
      if (formatted.length === 10) {
        formatted = `+1${formatted}`;
      } else if (!formatted.startsWith('+')) {
        formatted = `+${formatted}`;
      }
      return formatted;
    };

    // Format customer phone number
    const formattedCustomerPhone = formatPhoneNumber(typedCustomer.phone);

    // Extract phone number ID if full URL was provided
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes('openphone.com')) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) {
        phoneNumberId = match[1];
      }
    }

    // OpenPhone expects the raw API key
    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

    // Helper function to send SMS
    const sendSms = async (to: string, content: string, label: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
      console.log(`[send-on-the-way-sms] Sending ${label} SMS to ${to}`);
      
      const response = await fetch("https://api.openphone.com/v1/messages", {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: phoneNumberId,
          to: [to],
          content,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[send-on-the-way-sms] ${label} SMS failed: ${response.status} - ${errorText}`);
        return { success: false, error: errorText };
      }

      const result = await response.json();
      console.log(`[send-on-the-way-sms] ${label} SMS sent successfully:`, result);
      return { success: true, messageId: result.data?.id };
    };

    // Check notification preferences (default to true if not set)
    const notifyClient = smsSettings.notify_client_on_the_way !== false;
    const notifyAdmin = smsSettings.notify_admin_on_the_way !== false;

    // Send customer SMS if enabled
    let customerResult = { success: true, messageId: undefined as string | undefined };
    if (notifyClient) {
      customerResult = await sendSms(formattedCustomerPhone, customerMessage, 'customer');

      if (!customerResult.success) {
        let errorCode = 'SMS_FAILED';
        let userMessage = 'SMS delivery failed. Please try again later.';

        return new Response(
          JSON.stringify({
            success: false,
            error: userMessage,
            errorCode,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      console.log("[send-on-the-way-sms] Client notification disabled by org settings, skipping");
    }

    // Send admin SMS if admin phone is configured and enabled
    let adminSent = false;
    if (notifyAdmin && adminPhone) {
      const formattedAdminPhone = formatPhoneNumber(adminPhone);
      const adminResult = await sendSms(formattedAdminPhone, adminMessage, 'admin');
      adminSent = adminResult.success;
      if (!adminResult.success) {
        console.warn(`[send-on-the-way-sms] Admin notification failed, but customer was notified`);
      }
    } else if (!notifyAdmin) {
      console.log(`[send-on-the-way-sms] Admin notification disabled by org settings, skipping`);
    } else {
      console.log(`[send-on-the-way-sms] No admin phone configured, skipping admin notification`);
    }

    // Log to prevent duplicates (e.g. second cleaner pressing "on the way")
    await supabase.from('booking_reminder_log').insert({
      booking_id: bookingId,
      organization_id: booking.organization_id,
      recipient_phone: formattedCustomerPhone,
      reminder_type: 'on_the_way',
    });

    // Audit log
    logAudit({
      action: AuditActions.SMS_GENERIC,
      organizationId: booking.organization_id,
      resourceType: 'booking',
      resourceId: bookingId,
      success: true,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: customerResult.messageId,
        adminNotified: adminSent
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-on-the-way-sms] Error:", errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
