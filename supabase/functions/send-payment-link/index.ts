import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdminAuth, createUnauthorizedResponse, createForbiddenResponse } from "../_shared/verify-admin-auth.ts";
import { getOrgEmailSettings, formatEmailFrom, getReplyTo } from "../_shared/get-org-email-settings.ts";
import { logAudit, AuditActions } from "../_shared/audit-log.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PaymentLinkRequest {
  email: string;
  customerName: string;
  amount: number;
  serviceName: string;
  bookingId?: string;
  organizationId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY secret");
    return new Response(JSON.stringify({ error: "Email service is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    // SECURITY: Verify authenticated user with admin privileges
    const authResult = await verifyAdminAuth(req.headers.get("Authorization"), { requireAdmin: true });
    
    if (!authResult.success) {
      console.error("Auth failed:", authResult.error);
      return createUnauthorizedResponse(authResult.error || "Unauthorized", corsHeaders);
    }

    const { email, customerName, amount, serviceName, bookingId, organizationId }: PaymentLinkRequest = await req.json();

    console.log("Received payment link request:", { email, customerName, amount, serviceName, bookingId, organizationId, userId: authResult.userId });

    if (!email || !customerName || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // SECURITY: Verify organization context matches authenticated user
    if (!organizationId) {
      console.error("Missing organizationId - cannot send payment link without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (organizationId !== authResult.organizationId) {
      console.error("Organization mismatch in send-payment-link");
      await logAudit({
        action: AuditActions.PAYMENT_FAILED,
        userId: authResult.userId!,
        organizationId: authResult.organizationId!,
        details: { reason: "Organization mismatch", requestedOrg: organizationId },
      });
      return createForbiddenResponse("Access denied: organization mismatch", corsHeaders);
    }

    // STRICT ISOLATION: Get organization-specific Stripe credentials
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

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

    // Fetch email settings from organization_email_settings table (SINGLE SOURCE OF TRUTH)
    const emailSettingsResult = await getOrgEmailSettings(organizationId);
    
    if (!emailSettingsResult.success || !emailSettingsResult.settings) {
      console.error("Failed to get email settings:", emailSettingsResult.error);
      return new Response(JSON.stringify({ 
        error: emailSettingsResult.error || "Email settings not configured" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const emailSettings = emailSettingsResult.settings;
    const companyName = emailSettings.from_name;
    
    console.log("Using org email settings - from:", emailSettings.from_email, "name:", companyName);

    // Check if customer exists in Stripe, create if not
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    let customerId: string;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("Found existing Stripe customer:", customerId);
    } else {
      const newCustomer = await stripe.customers.create({
        email: email,
        name: customerName,
        metadata: {
          organization_id: organizationId,
        },
      });
      customerId = newCustomer.id;
      console.log("Created new Stripe customer:", customerId);
    }

    // Create a Stripe Checkout session for the payment
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: serviceName || "Cleaning Service",
              description: `Booking payment for ${customerName}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "https://tidywisecleaning.com",
      cancel_url: "https://tidywisecleaning.com",
      metadata: {
        bookingId: bookingId || "",
        customerName: customerName,
        serviceName: serviceName,
        organization_id: organizationId,
      },
    });

    console.log("Created Stripe checkout session:", session.id, "URL:", session.url);

    // Send email with the Stripe payment link
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: formatEmailFrom(emailSettings),
        to: [email],
        reply_to: getReplyTo(emailSettings),
        subject: "Complete Your Booking Payment",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .amount { font-size: 36px; font-weight: bold; color: #10b981; margin: 20px 0; }
              .button { display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
              .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
              .secure { display: flex; align-items: center; justify-content: center; gap: 8px; color: #666; font-size: 14px; margin-top: 10px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Complete Your Payment</h1>
              </div>
              <div class="content">
                <p>Hi ${customerName},</p>
                <p>Thank you for choosing ${companyName}! Please complete your payment to confirm your booking.</p>
                
                <div class="details">
                  <h3>Booking Details</h3>
                  <p><strong>Service:</strong> ${serviceName}</p>
                  <p class="amount">$${amount.toFixed(2)}</p>
                </div>
                
                <p>Click the button below to securely complete your payment:</p>
                
                <center>
                  <a href="${session.url}" class="button">Pay Now - Secure Checkout</a>
                </center>
                
                <div class="secure">
                  <span>🔒 Secured by Stripe</span>
                </div>
                
                <p style="color: #666; font-size: 14px; margin-top: 20px;">
                  This payment link will expire in 24 hours. If you have any questions, please don't hesitate to contact us.
                </p>
              </div>
              <div class="footer">
                <p>Questions? Reply to this email or contact us.</p>
                <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    let emailData: any = null;
    try {
      emailData = await emailResponse.json();
    } catch (_e) {
      emailData = null;
    }

    // If domain not verified, return helpful error
    if (!emailResponse.ok && emailData?.name === 'validation_error' && emailData?.message?.includes('not verified')) {
      const domain = emailSettings.from_email.split('@')[1];
      console.error(`Domain ${domain} is not verified on Resend`);
      throw new Error(`Your email domain (${domain}) is not verified. Please verify it at https://resend.com/domains to send emails.`);
    }

    if (!emailResponse.ok) {
      console.error("Resend API error:", { status: emailResponse.status, data: emailData });
      throw new Error(emailData?.message || `Failed to send email (status ${emailResponse.status})`);
    }

    // Log successful payment link send
    await logAudit({
      action: AuditActions.EMAIL_SENT,
      userId: authResult.userId!,
      organizationId: authResult.organizationId!,
      details: { 
        type: "payment_link",
        customerEmail: email,
        amount,
        sessionId: session.id 
      },
    });

    console.log("Payment link email sent successfully:", emailData);

    return new Response(JSON.stringify({ 
      success: true, 
      data: emailData,
      paymentUrl: session.url,
      sessionId: session.id
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-payment-link function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
