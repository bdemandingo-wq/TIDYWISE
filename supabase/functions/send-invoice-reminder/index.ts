import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SMS-Only Invoice Payment Reminder
 * This function sends automated SMS reminders for unpaid invoices
 * based on the organization's payment reminder settings.
 */

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log("[send-invoice-reminder] Starting reminder check...");

    // Get all active payment reminders
    const { data: reminders, error: remindersError } = await supabase
      .from("invoice_payment_reminders")
      .select(`
        *,
        organizations:organization_id (
          id,
          name
        )
      `)
      .eq("is_active", true)
      .eq("send_sms", true);

    if (remindersError) {
      throw new Error(`Failed to fetch reminders: ${remindersError.message}`);
    }

    console.log(`[send-invoice-reminder] Found ${reminders?.length || 0} active SMS reminders`);

    let sentCount = 0;
    let errorCount = 0;

    for (const reminder of reminders || []) {
      const organizationId = reminder.organization_id;
      const daysAfterDue = reminder.days_after_due;

      // Calculate the target due date (invoices that were due X days ago)
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - daysAfterDue);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Get unpaid invoices for this organization that match the reminder date
      const { data: invoices, error: invoicesError } = await supabase
        .from("invoices")
        .select(`
          *,
          customers:customer_id (
            first_name,
            last_name,
            phone,
            email
          )
        `)
        .eq("organization_id", organizationId)
        .eq("status", "sent")
        .eq("due_date", targetDateStr);

      if (invoicesError) {
        console.error(`[send-invoice-reminder] Error fetching invoices for org ${organizationId}:`, invoicesError);
        continue;
      }

      // Get organization SMS settings
      const { data: smsSettings } = await supabase
        .from("organization_sms_settings")
        .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();

      // STRICT ISOLATION: Only use organization-specific credentials, never fallback to platform keys
      if (!smsSettings?.openphone_api_key || !smsSettings?.openphone_phone_number_id) {
        console.log(`[send-invoice-reminder] Skipping org ${organizationId} - no OpenPhone credentials configured`);
        continue;
      }

      const openPhoneApiKey = smsSettings.openphone_api_key;
      const openPhoneNumberId = smsSettings.openphone_phone_number_id;

      // Get business settings for company name
      const { data: businessSettings } = await supabase
        .from("business_settings")
        .select("company_name")
        .eq("organization_id", organizationId)
        .maybeSingle();

      const companyName = businessSettings?.company_name || "Your service provider";

      // Send SMS reminders for each matching invoice
      for (const invoice of invoices || []) {
        const customer = invoice.customers;
        if (!customer?.phone) {
          console.log(`[send-invoice-reminder] Skipping invoice ${invoice.id} - no customer phone`);
          continue;
        }

        const customerName = `${customer.first_name} ${customer.last_name}`.trim();
        const paymentUrl = invoice.stripe_invoice_url || '';

        const smsContent = `Hi ${customerName}! 📋 Friendly reminder: Your invoice #${invoice.invoice_number} for $${invoice.total_amount.toFixed(2)} from ${companyName} is now ${daysAfterDue} days past due.\n\n${paymentUrl ? `Pay now: ${paymentUrl}` : 'Please contact us to arrange payment.'}`;

        try {
          const smsResponse = await fetch("https://api.openphone.com/v1/messages", {
            method: "POST",
            headers: {
              "Authorization": openPhoneApiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: smsContent,
              from: openPhoneNumberId,
              to: [customer.phone],
            }),
          });

          if (smsResponse.ok) {
            console.log(`[send-invoice-reminder] SMS sent for invoice ${invoice.id} to ${customer.phone}`);
            sentCount++;
          } else {
            const errorText = await smsResponse.text();
            console.error(`[send-invoice-reminder] SMS failed for invoice ${invoice.id}:`, errorText);
            errorCount++;
          }
        } catch (smsError) {
          console.error(`[send-invoice-reminder] SMS error for invoice ${invoice.id}:`, smsError);
          errorCount++;
        }
      }
    }

    console.log(`[send-invoice-reminder] Complete. Sent: ${sentCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        errors: errorCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[send-invoice-reminder] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
