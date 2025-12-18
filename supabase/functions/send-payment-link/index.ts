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

interface PaymentLinkRequest {
  email: string;
  customerName: string;
  amount: number;
  serviceName: string;
  bookingId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, customerName, amount, serviceName, bookingId }: PaymentLinkRequest = await req.json();

    console.log("Received payment link request:", { email, customerName, amount, serviceName, bookingId });

    if (!email || !customerName || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
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
            unit_amount: Math.round(amount * 100), // Convert to cents
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
      },
    });

    console.log("Created Stripe checkout session:", session.id, "URL:", session.url);

    // Send email with the Stripe payment link
    const emailResponse = await resend.emails.send({
      from: "Tidywise Cleaning <onboarding@resend.dev>",
      to: [email],
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
              <p>Thank you for choosing Tidywise Cleaning! Please complete your payment to confirm your booking.</p>
              
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
              <p>Questions? Reply to this email or call us at (813) 735-6859</p>
              <p>&copy; 2024 Tidywise Cleaning. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Payment link email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      data: emailResponse,
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
