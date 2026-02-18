import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import Stripe from "https://esm.sh/stripe@18.5.0";

// Platform-level Resend API key (shared email service) - instantiate inside handler
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CardLinkRequest {
  email: string;
  customerName: string;
  organizationId: string; // REQUIRED - no fallback allowed
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, customerName, organizationId }: CardLinkRequest = await req.json();

    console.log("Creating card collection link for:", { email, customerName, organizationId });

    if (!email || !customerName) {
      return new Response(
        JSON.stringify({ error: "Email and customer name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // CRITICAL: organizationId is REQUIRED for multi-tenant isolation
    if (!organizationId) {
      console.error("[send-card-collection-link] Missing organizationId - cannot send card link without organization context");
      return new Response(JSON.stringify({ 
        error: "Missing organizationId - organization context is required" 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // STRICT ISOLATION: Verify Resend API key is available
    if (!RESEND_API_KEY) {
      console.error("[send-card-collection-link] Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Fetch business settings for the SPECIFIC organization only
    let senderEmail = "";
    let companyName = "";
    
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // ONLY query settings for the specific organization - NO FALLBACK
      const { data: settings, error: settingsError } = await supabase
        .from('business_settings')
        .select('company_email, company_name')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      if (settingsError) {
        console.error("Error fetching organization settings:", settingsError);
      }
      
      if (!settings || !settings.company_email || !settings.company_name) {
        console.error("Organization settings not configured for org:", organizationId);
        return new Response(JSON.stringify({ 
          error: "Organization email settings not configured. Please set up your company email and name in Settings." 
        }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      
      senderEmail = settings.company_email;
      companyName = settings.company_name;
      
      console.log("Using organization settings - sender:", senderEmail, "company:", companyName);
    } else {
      return new Response(JSON.stringify({ error: "Database connection not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // STRICT ISOLATION: Get organization-specific Stripe credentials
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    // SECURITY FIX: Look for customer with matching email AND organization_id in metadata
    const customers = await stripe.customers.list({ email: email, limit: 100 });
    let customerId: string;

    // Find customer that belongs to THIS organization specifically
    const orgCustomer = customers.data.find((c: any) => {
      return c.metadata?.organization_id === organizationId;
    });

    if (orgCustomer) {
      customerId = orgCustomer.id;
      console.log("Found existing org-specific Stripe customer:", customerId);
    } else {
      // Create new customer WITH organization_id in metadata for strict isolation
      const newCustomer = await stripe.customers.create({
        email: email,
        name: customerName,
        metadata: {
          organization_id: organizationId,
        },
      });
      customerId = newCustomer.id;
      console.log("Created new org-specific Stripe customer:", customerId);
    }

    // Build dynamic success/cancel URLs using the app's published URL
    const appUrl = Deno.env.get("APP_URL") || "https://jointidywise.lovable.app";

    // Create a Stripe Checkout session in setup mode to collect card details
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "setup",
      payment_method_types: ["card"],
      success_url: `${appUrl}/card-saved?success=true`,
      cancel_url: `${appUrl}/card-saved?cancelled=true`,
      metadata: {
        customerName: customerName,
        purpose: "card_collection",
      },
    });

    console.log("[send-card-collection-link] Created Stripe checkout session:", session.id);

    // Send email with the card collection link
    const resend = new Resend(RESEND_API_KEY);
    const emailResponse = await resend.emails.send({
      from: `${companyName} <${senderEmail}>`,
      to: [email],
      subject: `Add Your Payment Card - ${companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #10b981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            .secure { display: flex; align-items: center; justify-content: center; gap: 8px; color: #666; font-size: 14px; margin-top: 15px; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Secure Card Setup</h1>
            </div>
            <div class="content">
              <p>Hi ${customerName},</p>
              <p>We need your payment card on file to complete your booking with ${companyName}.</p>
              
              <div class="info-box">
                <p><strong>Why do we need this?</strong></p>
                <p style="margin: 0; color: #666;">Your card will be securely saved for your upcoming cleaning service. You won't be charged until after your service is completed.</p>
              </div>
              
              <center>
                <a href="${session.url}" class="button">Add My Card Securely</a>
              </center>
              
              <div class="secure">
                <span>🔒 Secured by Stripe - Bank-level encryption</span>
              </div>
              
              <p style="color: #666; font-size: 14px; margin-top: 20px;">
                This link will expire in 24 hours. If you have any questions, please don't hesitate to contact us.
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
    });

    console.log("Card collection email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      emailId: emailResponse.data?.id,
      sessionUrl: session.url,
      message: "Card collection link sent successfully"
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-card-collection-link function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
