import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Time windows in hours
const REMINDER_WINDOWS = [
  { hours: 24, label: '24 hours' },
  { hours: 3, label: '3 hours' },
  { hours: 1, label: '1 hour' },
];

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse payload to get organizationId
    let payload: any = null;
    try {
      const text = await req.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    const isManualSend = !!payload?.customerPhone;
    const organizationId = payload?.organizationId;

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!organizationId) {
      console.error("[send-booking-reminder] Missing organizationId");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch SMS settings for the organization
    const { data: smsSettings, error: settingsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled, sms_appointment_reminder')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-booking-reminder] Error fetching SMS settings:", settingsError);
      return new Response(JSON.stringify({ 
        error: "Failed to fetch SMS settings" 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings?.sms_enabled) {
      console.log("[send-booking-reminder] SMS disabled for organization:", organizationId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "SMS notifications are disabled" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-booking-reminder] OpenPhone not configured for org:", organizationId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "OpenPhone not configured" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get company name and notification settings
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('company_name, notify_reminders')
      .eq('organization_id', organizationId)
      .maybeSingle();
    
    // Check if reminders are enabled in business settings
    if (businessSettings?.notify_reminders === false) {
      console.log("[send-booking-reminder] Reminders disabled in business settings for org:", organizationId);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Reminders are disabled in business settings" 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    const companyName = businessSettings?.company_name || 'Your cleaning service';

    // Extract phone number ID if full URL was provided
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes('openphone.com')) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) {
        phoneNumberId = match[1];
      }
    }

    // Helper function to send SMS
    const sendSMS = async (to: string, message: string): Promise<boolean> => {
      let formattedPhone = to.replace(/\D/g, '');
      if (formattedPhone.length === 10) {
        formattedPhone = `+1${formattedPhone}`;
      } else if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
      }

      const response = await fetch("https://api.openphone.com/v1/messages", {
        method: "POST",
        headers: {
          "Authorization": smsSettings.openphone_api_key!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: phoneNumberId,
          to: [formattedPhone],
          content: message,
        }),
      });

      return response.ok;
    };

    // Manual reminder send
    if (isManualSend) {
      const scheduledDate = payload?.scheduledAt ? new Date(payload.scheduledAt) : null;
      const formattedDate = scheduledDate
        ? scheduledDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'your scheduled date';
      const formattedTime = scheduledDate
        ? scheduledDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })
        : 'your scheduled time';

      const customerName = payload?.customerName || 'there';
      const serviceName = payload?.serviceName || 'cleaning';
      const address = payload?.address || '';

      const message = `Hi ${customerName}! This is a reminder about your ${serviceName} appointment with ${companyName} on ${formattedDate} at ${formattedTime}.${address ? ` Address: ${address}` : ''} Reply with any questions!`;

      console.log(`[send-booking-reminder] Manual reminder to ${payload.customerPhone}`);

      const success = await sendSMS(payload.customerPhone, message);

      if (success) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Reminder SMS sent",
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to send reminder SMS",
          }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Batch scheduled reminders - only if SMS reminders are enabled
    if (!smsSettings.sms_appointment_reminder) {
      console.log("[send-booking-reminder] Appointment reminders disabled for org:", organizationId);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Appointment reminders are disabled",
        reminders: [] 
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const now = new Date();
    const sentReminders: string[] = [];

    for (const window of REMINDER_WINDOWS) {
      const windowStart = new Date(now.getTime() + (window.hours * 60 - 15) * 60 * 1000);
      const windowEnd = new Date(now.getTime() + (window.hours * 60 + 15) * 60 * 1000);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:customers(*),
          service:services(*),
          staff:staff(*)
        `)
        .eq('organization_id', organizationId)
        .gte('scheduled_at', windowStart.toISOString())
        .lte('scheduled_at', windowEnd.toISOString())
        .in('status', ['pending', 'confirmed'])
        .not('customer_id', 'is', null);

      if (error) {
        console.error('[send-booking-reminder] Error fetching bookings:', error);
        continue;
      }

      console.log(`[send-booking-reminder] Found ${bookings?.length || 0} bookings for ${window.label} reminder`);

      for (const booking of bookings || []) {
        if (!booking.customer?.phone) continue;

        const scheduledDate = new Date(booking.scheduled_at);
        const formattedDate = scheduledDate.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        });
        const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const customerName = booking.customer.first_name || 'there';
        const serviceName = booking.service?.name || 'cleaning';
        const address = [booking.address, booking.city].filter(Boolean).join(', ');
        const staffName = booking.staff?.name;

        const message = `⏰ Reminder: Your ${serviceName} with ${companyName} is in ${window.label}!\n\n` +
          `📅 ${formattedDate} at ${formattedTime}\n` +
          `${address ? `📍 ${address}\n` : ''}` +
          `${staffName ? `👤 Cleaner: ${staffName}\n` : ''}` +
          `\nPlease ensure access to the property. Reply with any questions!`;

        try {
          const success = await sendSMS(booking.customer.phone, message);
          if (success) {
            sentReminders.push(`#${booking.booking_number} (${window.label})`);
            console.log(`[send-booking-reminder] SMS sent for booking #${booking.booking_number}`);
          } else {
            console.error(`[send-booking-reminder] Failed to send SMS for booking #${booking.booking_number}`);
          }
        } catch (smsError) {
          console.error(`[send-booking-reminder] Error sending SMS for booking #${booking.booking_number}:`, smsError);
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${sentReminders.length} reminder SMS`,
        reminders: sentReminders 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("[send-booking-reminder] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
