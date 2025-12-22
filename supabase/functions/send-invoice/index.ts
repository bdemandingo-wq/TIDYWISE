import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvoiceEmailRequest {
  customerName: string;
  customerEmail: string;
  invoiceNumber: number;
  serviceName: string;
  amount: number;
  address?: string;
  validUntil?: string;
  notes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-invoice function called");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY secret");
    return new Response(
      JSON.stringify({ error: "Email service is not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  if (!STRIPE_SECRET_KEY) {
    console.error("Missing STRIPE_SECRET_KEY secret");
    return new Response(
      JSON.stringify({ error: "Payment service is not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }

  try {
    const data: InvoiceEmailRequest = await req.json();
    console.log("Invoice email request:", data);

    const customerEmail = (data.customerEmail || "").trim();
    const customerName = (data.customerName || "").trim();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Missing customerEmail" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists in Stripe
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      console.log("Found existing Stripe customer:", customerId);
    } else {
      // Create new customer
      const newCustomer = await stripe.customers.create({
        email: customerEmail,
        name: customerName,
      });
      customerId = newCustomer.id;
      console.log("Created new Stripe customer:", customerId);
    }

    // Create a Stripe Checkout session for this invoice payment
    const origin = req.headers.get("origin") || "https://tidywisecleaning.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice #${data.invoiceNumber} - ${data.serviceName || 'Cleaning Service'}`,
              description: data.address ? `Service at ${data.address}` : undefined,
            },
            unit_amount: Math.round(data.amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/payment-success?invoice=${data.invoiceNumber}`,
      cancel_url: `${origin}/payment-canceled?invoice=${data.invoiceNumber}`,
      metadata: {
        invoice_number: String(data.invoiceNumber),
        service_name: data.serviceName || '',
      },
    });

    const paymentUrl = session.url;
    console.log("Created Stripe checkout session:", session.id, "URL:", paymentUrl);

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice #${data.invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#333333;line-height:1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;">
    <tr>
      <td style="padding:20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#1e5bb0;padding:30px;text-align:center;">
              <div style="font-size:32px;font-weight:bold;color:#ffffff;">
                TidyWise
              </div>
              <p style="color:#ffffff;font-size:14px;margin:5px 0 0 0;">Professional Cleaning Services</p>
            </td>
          </tr>
          
          <!-- Invoice Banner -->
          <tr>
            <td style="background-color:#2563eb;padding:15px;text-align:center;">
              <span style="color:#ffffff;font-size:18px;font-weight:600;">Invoice #${data.invoiceNumber}</span>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;margin:0 0 15px 0;">Hi ${customerName || "there"},</p>
              
              <p style="margin:0 0 20px 0;">Please find your invoice details below. Payment is due ${data.validUntil ? `by ${data.validUntil}` : 'upon receipt'}.</p>
              
              <!-- Invoice Details -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f9f9f9;border-radius:8px;margin-bottom:20px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="margin:0 0 15px 0;color:#1e5bb0;font-size:16px;">INVOICE DETAILS</h3>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Invoice Number</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">#${data.invoiceNumber}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Service</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.serviceName || 'Cleaning Service'}</td>
                      </tr>
                      ${data.address ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Address</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.address}</td>
                      </tr>
                      ` : ''}
                      ${data.validUntil ? `
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;color:#666;">Due Date</td>
                        <td style="padding:8px 0;border-bottom:1px solid #e0e0e0;text-align:right;font-weight:600;">${data.validUntil}</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding:12px 0;color:#666;font-size:18px;">Total Amount Due</td>
                        <td style="padding:12px 0;text-align:right;font-weight:bold;font-size:24px;color:#2563eb;">$${data.amount.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Pay Now Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:20px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="${paymentUrl}" target="_blank" style="display:inline-block;background-color:#22c55e;color:#ffffff;font-size:18px;font-weight:bold;text-decoration:none;padding:16px 40px;border-radius:8px;box-shadow:0 4px 6px rgba(34,197,94,0.3);">
                      💳 Pay Now - $${data.amount.toFixed(2)}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="text-align:center;padding-top:10px;">
                    <p style="margin:0;font-size:12px;color:#666;">Secure payment powered by Stripe</p>
                  </td>
                </tr>
              </table>
              
              ${data.notes ? `
              <div style="background-color:#fff3cd;padding:15px;border-radius:6px;border-left:4px solid #ffc107;margin-bottom:20px;">
                <strong>Notes:</strong><br>
                ${data.notes}
              </div>
              ` : ''}
              
              <hr style="border:none;border-top:1px solid #e0e0e0;margin:25px 0;">
              
              <p style="margin:0 0 10px 0;text-align:center;font-size:14px;color:#666;">
                Questions? Reply to this email or contact us anytime.
              </p>
              <p style="margin:0;text-align:center;font-size:16px;font-weight:bold;color:#1e5bb0;">
                Thank you for choosing TidyWise!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color:#333333;padding:20px;text-align:center;">
              <p style="color:#ffffff;font-size:14px;font-weight:600;margin:0 0 5px 0;">TidyWise Cleaning</p>
              <p style="color:#999999;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} TidyWise. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    console.log("Sending invoice email to:", customerEmail);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        // Resend requires the "from" domain to be verified.
        // Use the default Resend sender until tidywisecleaning.com is verified.
        from: "TidyWise Cleaning <onboarding@resend.dev>",
        to: [customerEmail],
        subject: `Invoice #${data.invoiceNumber} from TidyWise - Pay Online`,
        html: emailHtml,
      }),
    });

    let responseData: any = null;
    try {
      responseData = await response.json();
    } catch (_e) {
      responseData = null;
    }

    if (!response.ok) {
      console.error("Resend API error:", { status: response.status, data: responseData });
      throw new Error(responseData?.message || `Failed to send email (status ${response.status})`);
    }

    console.log("Invoice email sent successfully:", responseData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailId: responseData?.id,
        paymentUrl: paymentUrl,
        stripeSessionId: session.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invoice function:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
