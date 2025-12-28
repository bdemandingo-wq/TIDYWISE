import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import Stripe from "https://esm.sh/stripe@18.5.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CardLinkRequest {
  email: string;
  customerName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, customerName }: CardLinkRequest = await req.json();

    console.log("Creating card collection link for:", { email, customerName });

    if (!email || !customerName) {
      return new Response(
        JSON.stringify({ error: "Email and customer name are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

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
      });
      customerId = newCustomer.id;
      console.log("Created new Stripe customer:", customerId);
    }

    // Create a Stripe Checkout session in setup mode to collect card details
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "setup",
      payment_method_types: ["card"],
      success_url: "https://jointidywise.com/card-saved?success=true",
      cancel_url: "https://jointidywise.com/card-saved?cancelled=true",
      metadata: {
        customerName: customerName,
        purpose: "card_collection",
      },
    });

    console.log("Created Stripe checkout session for card collection:", session.id);

    // Send email with the card collection link
    const emailResponse = await resend.emails.send({
      from: "TidyWise Cleaning <support@tidywisecleaning.com>",
      to: [email],
      subject: "Add Your Payment Card - TidyWise Cleaning",
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
              <p>We need your payment card on file to complete your booking with TidyWise Cleaning.</p>
              
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
              <p>Questions? Reply to this email or call us at (813) 735-6859</p>
              <p>&copy; 2024 TidyWise Cleaning. All rights reserved.</p>
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
