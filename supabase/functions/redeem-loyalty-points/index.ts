import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPortalSession } from "../_shared/portal-session.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-session",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // SECURITY: this is called from the client portal, which has no
    // Supabase auth session — never trust customerId/organizationId from
    // the request body (that previously let anyone redeem points, and
    // apply the resulting store credit, to ANY customer they named). Both
    // are resolved from the signed portal session instead, so a customer
    // can only ever redeem their own points.
    const session = await verifyPortalSession(req, supabase);
    if (!session.ok) {
      return err(session.error, session.status);
    }
    const customerId = session.customer_id;
    const organizationId = session.organization_id;

    // Get loyalty settings
    const { data: bizSettings } = await supabase
      .from("business_settings")
      .select("loyalty_redemption_threshold, loyalty_redemption_dollar_value")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const threshold = bizSettings?.loyalty_redemption_threshold ?? 100;
    const dollarValue = bizSettings?.loyalty_redemption_dollar_value ?? 10.00;

    // SECURITY: redemption amount is always exactly one server-defined
    // "block" (the org's configured threshold) — never the client-supplied
    // pointsToRedeem. The UI only ever offers a single fixed redemption
    // action ("Redeem 100 pts for $10 credit"), so this doesn't change
    // legitimate behavior; it just stops the amount from being a body param.
    const pointsToRedeem = threshold;

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

    // Points are now spent. Everything past this point must either fully
    // succeed or roll the deduction back — a customer paying points for
    // credit that never lands is money lost with no recovery path.
    const rollbackPoints = async (reason: string, cause: unknown) => {
      console.error(`[redeem-loyalty-points] CRITICAL: ${reason}, rolling back point deduction:`, cause);
      const { error: rollbackErr } = await supabase
        .from("customer_loyalty")
        .update({ points: loyalty.points, updated_at: new Date().toISOString() })
        .eq("customer_id", customerId);
      if (rollbackErr) {
        // Worst case: could not deduct AND could not roll back. Points are
        // now in a genuinely inconsistent state — this must be loud.
        console.error("[redeem-loyalty-points] CRITICAL: rollback itself failed, points balance is now inconsistent:", {
          customerId, organizationId, pointsToRedeem, rollbackErr,
        });
      }
    };

    // Log transaction (audit trail only — doesn't gate money movement,
    // so a failure here is logged but not fatal to the redemption).
    const { error: txnErr } = await supabase.from("loyalty_transactions").insert({
      customer_id: customerId,
      points: -pointsToRedeem,
      transaction_type: "redeemed",
      description: `Redeemed ${pointsToRedeem} points for $${creditAmount.toFixed(2)} credit`,
    });
    if (txnErr) {
      console.error("[redeem-loyalty-points] loyalty_transactions insert failed (non-fatal, audit trail only):", txnErr);
    }

    // Add credit to customer credits column
    const { data: customer, error: customerReadErr } = await supabase
      .from("customers")
      .select("credits")
      .eq("id", customerId)
      .maybeSingle();

    if (customerReadErr) {
      // Do NOT default to 0 here — that would let the update below wipe
      // out any credit balance the customer already had.
      await rollbackPoints("could not read current credit balance", customerReadErr);
      return err("Redemption failed. Your points were not spent — please try again.", 500);
    }

    const currentCredits = customer?.credits ?? 0;
    const { error: creditErr } = await supabase
      .from("customers")
      .update({ credits: currentCredits + creditAmount })
      .eq("id", customerId);

    if (creditErr) {
      await rollbackPoints("credit update failed after points were deducted", creditErr);
      return err("Redemption failed. Your points were not spent — please try again.", 500);
    }

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
