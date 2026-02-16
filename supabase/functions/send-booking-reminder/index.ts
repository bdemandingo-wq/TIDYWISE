import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let payload: any = null;
    try {
      const text = await req.text();
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    const isManualSend = !!payload?.customerPhone;
    const organizationId = payload?.organizationId;

    // If no organizationId and not manual, iterate all orgs (cron mode)
    if (!organizationId && !isManualSend) {
      console.log("[send-booking-reminder] Cron mode: fetching all organizations");
      const { data: orgs, error: orgsError } = await supabase
        .from("organizations")
        .select("id");

      if (orgsError || !orgs?.length) {
        console.error("[send-booking-reminder] Failed to fetch orgs:", orgsError);
        return new Response(JSON.stringify({ success: false, error: "No organizations found" }), {
          status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const allResults: string[] = [];
      for (const org of orgs) {
        try {
          const orgUrl = `${supabaseUrl}/functions/v1/send-booking-reminder`;
          const resp = await fetch(orgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
            body: JSON.stringify({ organizationId: org.id }),
          });
          const result = await resp.json();
          if (result.reminders?.length) {
            allResults.push(...result.reminders);
          }
        } catch (e) {
          console.error(`[send-booking-reminder] Error for org ${org.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: `Cron complete: ${allResults.length} reminders`, reminders: allResults }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: "Missing organizationId" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch SMS settings
    const { data: smsSettings, error: settingsError } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled, sms_appointment_reminder")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (settingsError) {
      console.error("[send-booking-reminder] SMS settings error:", settingsError);
      return new Response(JSON.stringify({ error: "Failed to fetch SMS settings" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings?.sms_enabled || !smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.log("[send-booking-reminder] SMS disabled or not configured for org:", organizationId);
      return new Response(JSON.stringify({ success: false, error: "SMS not configured or disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Get business settings
    const { data: businessSettings } = await supabase
      .from("business_settings")
      .select("company_name, notify_reminders")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (businessSettings?.notify_reminders === false) {
      return new Response(JSON.stringify({ success: false, error: "Reminders disabled" }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const companyName = businessSettings?.company_name || "Your cleaning service";

    // Extract phone number ID
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes("openphone.com")) {
      const match = phoneNumberId.match(/phone-numbers\/([A-Za-z0-9]+)/);
      if (match) phoneNumberId = match[1];
    }

    const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, "");

    // --- Helper: format phone ---
    const formatPhone = (phone: string): string => {
      let p = phone.replace(/\D/g, "");
      if (p.length === 10) return `+1${p}`;
      if (!p.startsWith("+")) return `+${p}`;
      return p;
    };

    // --- Helper: send SMS and log to conversation history ---
    const sendAndLog = async (
      to: string,
      message: string,
      recipientName: string,
      bookingId: string,
      reminderType: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const formattedPhone = formatPhone(to);

      // Check if already sent (dedup)
      const { data: existing } = await supabase
        .from("booking_reminder_log")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("reminder_type", reminderType)
        .maybeSingle();

      if (existing) {
        console.log(`[send-booking-reminder] Already sent ${reminderType} for booking ${bookingId}`);
        return { success: true }; // Already sent, skip
      }

      // Send via OpenPhone
      const response = await fetch("https://api.openphone.com/v1/messages", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ from: phoneNumberId, to: [formattedPhone], content: message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[send-booking-reminder] OpenPhone error ${response.status}: ${errorText}`);
        if (response.status === 402) return { success: false, error: "SMS billing issue" };
        if (response.status === 401) return { success: false, error: "Invalid API key" };
        return { success: false, error: "SMS delivery failed" };
      }

      const result = await response.json();

      // Log to booking_reminder_log (dedup)
      await supabase.from("booking_reminder_log").insert({
        booking_id: bookingId,
        organization_id: organizationId,
        reminder_type: reminderType,
        recipient_phone: formattedPhone,
      });

      // Log to conversation history
      try {
        // Find or create conversation
        let { data: conversation } = await supabase
          .from("sms_conversations")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("customer_phone", formattedPhone)
          .maybeSingle();

        if (!conversation) {
          const { data: newConv } = await supabase
            .from("sms_conversations")
            .insert({
              organization_id: organizationId,
              customer_phone: formattedPhone,
              customer_name: recipientName,
              last_message_at: new Date().toISOString(),
              conversation_type: "automated",
            })
            .select("id")
            .single();
          conversation = newConv;
        } else {
          await supabase
            .from("sms_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversation.id);
        }

        if (conversation) {
          await supabase.from("sms_messages").insert({
            conversation_id: conversation.id,
            organization_id: organizationId,
            direction: "outgoing",
            content: message,
            status: "sent",
            openphone_message_id: result.data?.id || null,
            sent_at: new Date().toISOString(),
          });
        }
      } catch (logError) {
        console.error("[send-booking-reminder] Conversation log error:", logError);
      }

      return { success: true };
    };

    // ============ MANUAL SEND ============
    if (isManualSend) {
      const formattedDate = payload?.formattedDate || (payload?.scheduledAt
        ? new Date(payload.scheduledAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : "your scheduled date");
      const formattedTime = payload?.formattedTime || (payload?.scheduledAt
        ? new Date(payload.scheduledAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
        : "your scheduled time");

      const customerName = payload?.customerName || "there";
      const serviceName = payload?.serviceName || "cleaning";
      const address = payload?.address || "";

      const message = `Hi ${customerName}! This is a reminder about your ${serviceName} appointment with ${companyName} on ${formattedDate} at ${formattedTime}.${address ? ` Address: ${address}` : ""} Reply with any questions!`;

      const result = await sendAndLog(
        payload.customerPhone,
        message,
        customerName,
        payload.bookingId || "manual",
        "client_manual",
      );

      return new Response(JSON.stringify(result), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ============ AUTOMATED 24H REMINDERS ============
    if (!smsSettings.sms_appointment_reminder) {
      return new Response(JSON.stringify({ success: true, message: "Reminders disabled", reminders: [] }), {
        status: 200, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const now = new Date();
    // Window: bookings between 23h45m and 24h15m from now
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000 + 45 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 15 * 60 * 1000);

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select(`
        *,
        customer:customers(*),
        service:services(*),
        staff:staff(*)
      `)
      .eq("organization_id", organizationId)
      .gte("scheduled_at", windowStart.toISOString())
      .lte("scheduled_at", windowEnd.toISOString())
      .in("status", ["pending", "confirmed"])
      .not("customer_id", "is", null);

    if (error) {
      console.error("[send-booking-reminder] Fetch bookings error:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch bookings" }), {
        status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`[send-booking-reminder] Found ${bookings?.length || 0} bookings for 24h reminder window`);

    const sentReminders: string[] = [];

    for (const booking of bookings || []) {
      const scheduledDate = new Date(booking.scheduled_at);
      const formattedDate = scheduledDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const formattedTime = scheduledDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const address = [booking.address, booking.city].filter(Boolean).join(", ");
      const serviceName = booking.service?.name || "cleaning";

      // --- CLIENT REMINDER ---
      if (booking.customer?.phone) {
        const customerName = booking.customer.first_name || "there";
        const staffName = booking.staff?.name;

        const clientMsg =
          `⏰ Reminder: Your ${serviceName} with ${companyName} is tomorrow!\n\n` +
          `📅 ${formattedDate} at ${formattedTime}\n` +
          `${address ? `📍 ${address}\n` : ""}` +
          `${staffName ? `👤 Cleaner: ${staffName}\n` : ""}` +
          `\nPlease ensure access to the property. Reply with any questions!`;

        const clientResult = await sendAndLog(
          booking.customer.phone,
          clientMsg,
          `${booking.customer.first_name || ""} ${booking.customer.last_name || ""}`.trim(),
          booking.id,
          "client_24h",
        );

        if (clientResult.success) {
          sentReminders.push(`#${booking.booking_number} client`);
        } else {
          console.error(`[send-booking-reminder] Client SMS failed for #${booking.booking_number}: ${clientResult.error}`);
        }
      }

      // --- CLEANER REMINDER ---
      if (booking.staff?.phone) {
        const cleanerName = booking.staff.name || "there";
        const customerName = `${booking.customer?.first_name || ""} ${booking.customer?.last_name || ""}`.trim() || "Customer";

        const cleanerMsg =
          `📋 REMINDER: You have a job tomorrow!\n\n` +
          `Hi ${cleanerName},\n\n` +
          `Booking #${booking.booking_number}\n` +
          `Service: ${serviceName}\n` +
          `📅 ${formattedDate} at ${formattedTime}\n` +
          `${address ? `📍 ${address}\n` : ""}` +
          `Customer: ${customerName}\n` +
          `${booking.customer?.phone ? `Phone: ${booking.customer.phone}\n` : ""}` +
          `\n- ${companyName}`;

        const cleanerResult = await sendAndLog(
          booking.staff.phone,
          cleanerMsg,
          cleanerName,
          booking.id,
          "cleaner_24h",
        );

        if (cleanerResult.success) {
          sentReminders.push(`#${booking.booking_number} cleaner`);
        } else {
          console.error(`[send-booking-reminder] Cleaner SMS failed for #${booking.booking_number}: ${cleanerResult.error}`);
        }
      }

      // Also check team assignments for additional cleaners
      try {
        const { data: teamAssignments } = await supabase
          .from("booking_team_assignments")
          .select("staff_id, staff:staff(*)")
          .eq("booking_id", booking.id)
          .neq("staff_id", booking.staff_id || "");

        for (const assignment of teamAssignments || []) {
          const teamStaff = (assignment as any).staff;
          if (!teamStaff?.phone) continue;

          const teamCleanerMsg =
            `📋 REMINDER: You have a job tomorrow!\n\n` +
            `Hi ${teamStaff.name || "there"},\n\n` +
            `Booking #${booking.booking_number}\n` +
            `Service: ${serviceName}\n` +
            `📅 ${formattedDate} at ${formattedTime}\n` +
            `${address ? `📍 ${address}\n` : ""}` +
            `Customer: ${booking.customer?.first_name || "Customer"}\n` +
            `\n- ${companyName}`;

          // Use a unique reminder_type per team member
          const teamResult = await sendAndLog(
            teamStaff.phone,
            teamCleanerMsg,
            teamStaff.name || "Team member",
            booking.id,
            `cleaner_24h_${teamStaff.id}`,
          );

          if (teamResult.success) {
            sentReminders.push(`#${booking.booking_number} team:${teamStaff.name}`);
          }
        }
      } catch (teamError) {
        console.error(`[send-booking-reminder] Team assignment error for #${booking.booking_number}:`, teamError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Sent ${sentReminders.length} reminders`, reminders: sentReminders }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("[send-booking-reminder] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
