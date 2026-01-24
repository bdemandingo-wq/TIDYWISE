import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CardLinkSmsRequest {
  phone: string;
  email: string;
  customerName: string;
  organizationId: string;
  amount: number; // Amount in dollars
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, email, customerName, organizationId, amount }: CardLinkSmsRequest = await req.json();

    console.log("Creating payment link SMS for:", { phone, customerName, organizationId, amount });

    if (!phone || !customerName || !amount) {
      return new Response(
        JSON.stringify({ error: "Phone, customer name, and amount are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!organizationId) {
      console.error("Missing organizationId - cannot send card link without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Database connection not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch organization SMS settings - ONLY for specific org
    const { data: smsSettings, error: smsError } = await supabase
      .from('organization_sms_settings')
      .select('openphone_api_key, openphone_phone_number_id, sms_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (smsError) {
      console.error("Error fetching SMS settings:", smsError);
      return new Response(JSON.stringify({ 
        error: "Failed to fetch SMS settings for organization" 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings || !smsSettings.sms_enabled) {
      console.error("SMS not enabled for organization:", organizationId);
      return new Response(JSON.stringify({ 
        error: "SMS is not enabled for this organization. Please configure SMS settings first." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!smsSettings.openphone_api_key || !smsSettings.openphone_phone_number_id) {
      console.error("OpenPhone settings not configured for org:", organizationId);
      return new Response(JSON.stringify({ 
        error: "OpenPhone API key or phone number not configured. Please set up SMS settings." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Extract phone number ID from URL if needed (handles both full URLs and IDs)
    let phoneNumberId = smsSettings.openphone_phone_number_id;
    if (phoneNumberId.includes('openphone.com')) {
      // Extract PN... ID from URL like https://my.openphone.com/settings/phone-numbers/PNr7XukuaV
      const match = phoneNumberId.match(/PN[a-zA-Z0-9]+/);
      if (match) {
        phoneNumberId = match[0];
        console.log("Extracted phone number ID from URL:", phoneNumberId);
      } else {
        console.error("Could not extract phone number ID from URL:", phoneNumberId);
        return new Response(JSON.stringify({ 
          error: "Invalid OpenPhone phone number ID format. Please update SMS settings with just the phone number ID (e.g., PNxxxxxxxx)." 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Get company name for the message
    const { data: settings } = await supabase
      .from('business_settings')
      .select('company_name')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const companyName = settings?.company_name || "Your cleaning service";

    // STRICT ISOLATION: Get organization-specific Stripe credentials
    const { data: orgStripeSettings } = await supabase
      .from("org_stripe_settings")
      .select("stripe_secret_key")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const stripeSecretKey = orgStripeSettings?.stripe_secret_key;
    
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured for this organization. Please connect your Stripe account in Settings → Payments." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists in Stripe, create if not
    let customerId: string;
    
    if (email) {
      const customers = await stripe.customers.list({ email: email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log("Found existing Stripe customer:", customerId);
      } else {
        const newCustomer = await stripe.customers.create({
          email: email,
          name: customerName,
          phone: phone,
        });
        customerId = newCustomer.id;
        console.log("Created new Stripe customer:", customerId);
      }
    } else {
      // Create customer with just phone and name
      const newCustomer = await stripe.customers.create({
        name: customerName,
        phone: phone,
      });
      customerId = newCustomer.id;
      console.log("Created new Stripe customer (phone only):", customerId);
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(amount * 100);

    // Create a Stripe Checkout session in payment mode to charge immediately
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Cleaning Service for ${customerName}`,
              description: `Payment for cleaning service from ${companyName}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      success_url: "https://tidywisecleaning.com/payment-success?success=true",
      cancel_url: "https://tidywisecleaning.com/payment-cancelled",
      metadata: {
        customerName: customerName,
        purpose: "cleaning_payment",
        organizationId: organizationId,
        amount: amount.toString(),
      },
    });

    console.log("Created Stripe payment session:", session.id);

    // Format phone number
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
      formattedPhone = '1' + formattedPhone;
    }
    formattedPhone = '+' + formattedPhone;

    // Send SMS via OpenPhone
    const smsMessage = `${companyName}: Your cleaning service total is $${amount.toFixed(2)}. Pay securely here: ${session.url}`;

     // OpenPhone expects the raw API key in the Authorization header
     const authHeader = smsSettings.openphone_api_key.trim().replace(/^Bearer\s+/i, '');

    const openPhoneResponse = await fetch('https://api.openphone.com/v1/messages', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: smsMessage,
        from: phoneNumberId,
        to: [formattedPhone],
      }),
    });

    if (!openPhoneResponse.ok) {
      const errorText = await openPhoneResponse.text();
      console.error("OpenPhone API error:", openPhoneResponse.status, errorText);
      
      // Handle billing/payment issues gracefully
      if (openPhoneResponse.status === 402) {
        return new Response(JSON.stringify({ 
          success: false,
          error: "SMS service requires payment. Please check your OpenPhone account billing.",
          errorCode: "BILLING_REQUIRED",
          sessionUrl: session.url // Still provide the payment URL
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      // Handle auth issues
      if (openPhoneResponse.status === 401) {
        return new Response(JSON.stringify({ 
          success: false,
          error: "Invalid OpenPhone API key. Please update your SMS settings.",
          errorCode: "AUTH_FAILED",
          sessionUrl: session.url
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      return new Response(JSON.stringify({ 
        success: false,
        error: "SMS delivery failed. Please try again later.",
        sessionUrl: session.url
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const smsResult = await openPhoneResponse.json();
    console.log("Payment link SMS sent successfully:", smsResult);

    return new Response(JSON.stringify({ 
      success: true, 
      sessionUrl: session.url,
      message: "Payment link sent via SMS successfully"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-card-link-sms function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
