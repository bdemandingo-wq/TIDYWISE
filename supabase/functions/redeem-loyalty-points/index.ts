import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { customerId, organizationId, pointsToRedeem } = await req.json();

    if (!customerId || !organizationId || !pointsToRedeem) {
      return err("Missing required fields", 400);
    }

    // Get loyalty settings
    const { data: bizSettings } = await supabase
      .from("business_settings")
      .select("loyalty_redemption_threshold, loyalty_redemption_dollar_value")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const threshold = bizSettings?.loyalty_redemption_threshold ?? 100;
    const dollarValue = bizSettings?.loyalty_redemption_dollar_value ?? 10.00;

    if (pointsToRedeem < threshold) {
      return err(`Minimum redemption is ${threshold} points`, 400);
    }

    // Get current loyalty balance
    const { data: loyalty, error: loyaltyErr } = await supabase
      .from("customer_loyalty")
      .select("points, lifetime_points")
      .eq("customer_id", customerId)
      .maybeSingle();

    if (loyaltyErr || !loyalty) return err("Loyalty account not found", 404);

    if (loyalty.points < pointsToRedeem) {
      return err(`Insufficient points. You have ${loyalty.points} points.`, 400);
    }

    // Calculate dollar value: proportional to threshold
    const blocks = Math.floor(pointsToRedeem / threshold);
    const creditAmount = blocks * dollarValue;

    // Deduct points
    const { error: updateErr } = await supabase
      .from("customer_loyalty")
      .update({ points: loyalty.points - pointsToRedeem, updated_at: new Date().toISOString() })
      .eq("customer_id", customerId);

    if (updateErr) throw updateErr;

    // Log transaction
    await supabase.from("loyalty_transactions").insert({
      customer_id: customerId,
      points: -pointsToRedeem,
      transaction_type: "redeemed",
      description: `Redeemed ${pointsToRedeem} points for $${creditAmount.toFixed(2)} credit`,
    });

    // Add credit to customer credits column
    const { data: customer } = await supabase
      .from("customers")
      .select("credits")
      .eq("id", customerId)
      .maybeSingle();

    const currentCredits = customer?.credits ?? 0;
    await supabase
      .from("customers")
      .update({ credits: currentCredits + creditAmount })
      .eq("id", customerId);

    return new Response(JSON.stringify({
      success: true,
      pointsRedeemed: pointsToRedeem,
      creditAmount,
      remainingPoints: loyalty.points - pointsToRedeem,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[redeem-loyalty-points]", e);
    return err(e.message || "Unexpected error", 500);
  }
});

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
