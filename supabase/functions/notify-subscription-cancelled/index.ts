import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CancellationRequest {
  customerEmail: string;
  customerName: string;
  reason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customerEmail, customerName, reason }: CancellationRequest = await req.json();

    // Send notification to support
    const emailResponse = await resend.emails.send({
      from: "TIDYWISE <notifications@resend.dev>",
      to: ["support@tidywisecleaning.com"],
      subject: `Subscription Cancelled: ${customerName}`,
      html: `
        <h2>Subscription Cancellation Notice</h2>
        <p>A customer has cancelled their TIDYWISE Pro subscription:</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px; font-weight: bold;">Customer Name:</td>
            <td style="padding: 8px;">${customerName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Email:</td>
            <td style="padding: 8px;">${customerEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Cancellation Date:</td>
            <td style="padding: 8px;">${new Date().toLocaleDateString()}</td>
          </tr>
          ${reason ? `
          <tr>
            <td style="padding: 8px; font-weight: bold;">Reason:</td>
            <td style="padding: 8px;">${reason}</td>
          </tr>
          ` : ''}
        </table>
        <p>Please follow up with this customer to understand their feedback and potentially win them back.</p>
        <p style="color: #666; font-size: 12px;">This is an automated notification from TIDYWISE.</p>
      `,
    });

    console.log("Cancellation notification sent:", emailResponse);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in notify-subscription-cancelled:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
