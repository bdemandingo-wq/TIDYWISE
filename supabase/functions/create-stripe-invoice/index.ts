import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateInvoiceRequest {
  invoiceId: string;
  organizationId: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  taxAmount: number;
  dueDate?: string;
  notes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!stripeSecretKey) {
    return new Response(
      JSON.stringify({ error: "Stripe secret key not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error("Invalid authentication");
    }

    const data: CreateInvoiceRequest = await req.json();
    console.log("Creating Stripe invoice for:", data.invoiceId);

    // Verify user belongs to the organization
    const { data: membership, error: membershipError } = await supabase
      .from("org_memberships")
      .select("organization_id, role")
      .eq("user_id", userData.user.id)
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error("User not authorized for this organization");
    }

    // Get or create Stripe customer
    const customers = await stripe.customers.list({ email: data.customerEmail, limit: 1 });
    let customerId: string;

    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: data.customerEmail,
        name: data.customerName,
        phone: data.customerPhone,
      });
      customerId = customer.id;
    }

    console.log("Using Stripe customer:", customerId);

    // Get business settings for branding
    const { data: businessSettings } = await supabase
      .from("business_settings")
      .select("company_name")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    const companyName = businessSettings?.company_name || "Your Business";

    // Create a Stripe Checkout Session for this invoice
    const lineItems = data.items.map(item => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.description,
        },
        unit_amount: Math.round(item.unitPrice * 100), // Convert to cents
      },
      quantity: item.quantity,
    }));

    // Add tax as a line item if applicable
    if (data.taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Sales Tax",
          },
          unit_amount: Math.round(data.taxAmount * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: lineItems,
      mode: "payment",
      success_url: `${req.headers.get("origin")}/dashboard/invoices?paid=true`,
      cancel_url: `${req.headers.get("origin")}/dashboard/invoices`,
      metadata: {
        invoice_id: data.invoiceId,
        organization_id: data.organizationId,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata: {
            invoice_id: data.invoiceId,
          },
        },
      },
    });

    console.log("Created Stripe checkout session:", session.id);

    // Update the invoice with Stripe info
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        stripe_invoice_url: session.url,
        stripe_invoice_id: session.id,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", data.invoiceId);

    if (updateError) {
      console.error("Failed to update invoice:", updateError);
    }

    // Get organization SMS settings
    const { data: smsSettings } = await supabase
      .from("organization_sms_settings")
      .select("openphone_api_key, openphone_phone_number_id, sms_enabled")
      .eq("organization_id", data.organizationId)
      .maybeSingle();

    // SMS-ONLY: Send payment link via SMS (OpenPhone)
    const openPhoneApiKey = smsSettings?.openphone_api_key || Deno.env.get("OPENPHONE_API_KEY");
    const openPhoneNumberId = smsSettings?.openphone_phone_number_id || Deno.env.get("OPENPHONE_PHONE_NUMBER_ID");

    if (openPhoneApiKey && openPhoneNumberId && data.customerPhone) {
      try {
        // Format phone number to E.164 format (must start with +)
        let formattedPhone = data.customerPhone.replace(/\D/g, ''); // Remove non-digits
        if (!formattedPhone.startsWith('+')) {
          // Assume US number if no country code
          if (formattedPhone.length === 10) {
            formattedPhone = `+1${formattedPhone}`;
          } else if (formattedPhone.length === 11 && formattedPhone.startsWith('1')) {
            formattedPhone = `+${formattedPhone}`;
          } else {
            formattedPhone = `+${formattedPhone}`;
          }
        }

        const dueDateText = data.dueDate 
          ? ` Due: ${new Date(data.dueDate).toLocaleDateString()}.`
          : '';
        
        const smsContent = `Hi ${data.customerName}! 📄 You have a new invoice for $${data.totalAmount.toFixed(2)} from ${companyName}.${dueDateText}\n\nPay securely here: ${session.url}`;

        console.log("Sending SMS to formatted number:", formattedPhone);

        const smsResponse = await fetch("https://api.openphone.com/v1/messages", {
          method: "POST",
          headers: {
            "Authorization": openPhoneApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: smsContent,
            from: openPhoneNumberId,
            to: [formattedPhone],
          }),
        });

        if (smsResponse.ok) {
          console.log("Invoice SMS sent to:", formattedPhone);
        } else {
          const errorText = await smsResponse.text();
          console.error("Invoice SMS failed:", errorText);
        }
      } catch (smsError) {
        console.error("Failed to send invoice SMS:", smsError);
      }
    } else {
      console.log("SMS not sent - missing phone settings or customer phone number");
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error creating Stripe invoice:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
