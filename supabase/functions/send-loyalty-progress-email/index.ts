import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoyaltyProgressRequest {
  customerEmail: string;
  customerName: string;
  pointsEarned: number;
  totalPoints: number;
  lifetimePoints: number;
  currentTier: string;
  nextTier: string | null;
  pointsToNextTier: number | null;
  bookingNumber: string;
}

const getTierColor = (tier: string): string => {
  switch (tier.toLowerCase()) {
    case 'bronze': return '#CD7F32';
    case 'silver': return '#C0C0C0';
    case 'gold': return '#FFD700';
    case 'platinum': return '#E5E4E2';
    default: return '#3b82f6';
  }
};

const getTierBadge = (tier: string): string => {
  const color = getTierColor(tier);
  return `
    <span style="display: inline-block; padding: 4px 12px; background-color: ${color}; color: ${tier === 'gold' || tier === 'platinum' ? '#1a1a1a' : '#ffffff'}; border-radius: 9999px; font-weight: 600; text-transform: uppercase; font-size: 12px;">
      ${tier}
    </span>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const {
      customerEmail,
      customerName,
      pointsEarned,
      totalPoints,
      lifetimePoints,
      currentTier,
      nextTier,
      pointsToNextTier,
      bookingNumber,
    }: LoyaltyProgressRequest = await req.json();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Customer email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const progressPercentage = nextTier && pointsToNextTier 
      ? Math.min(100, Math.round(((lifetimePoints % 500) / (pointsToNextTier + (lifetimePoints % 500))) * 100))
      : 100;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Loyalty Points Update</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); padding: 32px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">
                      🎉 You Earned Points!
                    </h1>
                  </td>
                </tr>
                
                <!-- Points Earned Section -->
                <tr>
                  <td style="padding: 32px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 14px;">
                      Thanks for booking with us, ${customerName}!
                    </p>
                    <p style="margin: 0 0 24px 0; color: #71717a; font-size: 14px;">
                      Booking #${bookingNumber}
                    </p>
                    
                    <!-- Points Earned Circle -->
                    <div style="display: inline-block; width: 120px; height: 120px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #14b8a6 100%); padding: 4px;">
                      <div style="width: 112px; height: 112px; border-radius: 50%; background-color: #ffffff; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                        <span style="font-size: 36px; font-weight: 700; color: #3b82f6;">+${pointsEarned}</span>
                        <span style="font-size: 12px; color: #71717a; text-transform: uppercase;">Points</span>
                      </div>
                    </div>
                  </td>
                </tr>
                
                <!-- Current Status -->
                <tr>
                  <td style="padding: 0 32px 32px 32px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f5; border-radius: 8px;">
                      <tr>
                        <td style="padding: 24px; text-align: center;">
                          <p style="margin: 0 0 16px 0; color: #71717a; font-size: 14px;">Your Current Tier</p>
                          ${getTierBadge(currentTier)}
                          
                          <div style="margin-top: 24px; text-align: left;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                              <span style="font-size: 14px; color: #3f3f46;">Available Points</span>
                              <span style="font-size: 14px; font-weight: 600; color: #3b82f6;">${totalPoints}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                              <span style="font-size: 14px; color: #3f3f46;">Lifetime Points</span>
                              <span style="font-size: 14px; font-weight: 600; color: #3f3f46;">${lifetimePoints}</span>
                            </div>
                          </div>
                          
                          ${nextTier ? `
                            <div style="margin-top: 24px;">
                              <p style="margin: 0 0 8px 0; font-size: 12px; color: #71717a;">
                                ${pointsToNextTier} more points to ${nextTier.toUpperCase()}
                              </p>
                              <div style="width: 100%; height: 8px; background-color: #e4e4e7; border-radius: 4px; overflow: hidden;">
                                <div style="width: ${progressPercentage}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #14b8a6); border-radius: 4px;"></div>
                              </div>
                            </div>
                          ` : `
                            <div style="margin-top: 24px;">
                              <p style="margin: 0; font-size: 14px; color: #14b8a6; font-weight: 600;">
                                🏆 You've reached the highest tier!
                              </p>
                            </div>
                          `}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Tier Benefits -->
                <tr>
                  <td style="padding: 0 32px 32px 32px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #3f3f46;">Tier Benefits</h3>
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 12px; background-color: ${currentTier === 'bronze' ? '#f0fdf4' : '#f4f4f5'}; border-radius: 6px; margin-bottom: 8px;">
                          <span style="font-weight: 600; color: #CD7F32;">Bronze:</span>
                          <span style="color: #71717a;"> 1 point per $1 spent</span>
                        </td>
                      </tr>
                      <tr><td style="height: 8px;"></td></tr>
                      <tr>
                        <td style="padding: 12px; background-color: ${currentTier === 'silver' ? '#f0fdf4' : '#f4f4f5'}; border-radius: 6px;">
                          <span style="font-weight: 600; color: #71717a;">Silver (500+ pts):</span>
                          <span style="color: #71717a;"> 5% discount on services</span>
                        </td>
                      </tr>
                      <tr><td style="height: 8px;"></td></tr>
                      <tr>
                        <td style="padding: 12px; background-color: ${currentTier === 'gold' ? '#f0fdf4' : '#f4f4f5'}; border-radius: 6px;">
                          <span style="font-weight: 600; color: #ca8a04;">Gold (2000+ pts):</span>
                          <span style="color: #71717a;"> 10% discount + priority booking</span>
                        </td>
                      </tr>
                      <tr><td style="height: 8px;"></td></tr>
                      <tr>
                        <td style="padding: 12px; background-color: ${currentTier === 'platinum' ? '#f0fdf4' : '#f4f4f5'}; border-radius: 6px;">
                          <span style="font-weight: 600; color: #71717a;">Platinum (5000+ pts):</span>
                          <span style="color: #71717a;"> 15% discount + VIP perks</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 24px 32px; background-color: #f4f4f5; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #71717a;">
                      Thank you for being a loyal customer!
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

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TidyWise <support@tidywisecleaning.com>",
        to: [customerEmail],
        subject: `🎉 You earned ${pointsEarned} loyalty points!`,
        html: emailHtml,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Resend API error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    console.log("Email sent successfully:", data);

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in send-loyalty-progress-email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
