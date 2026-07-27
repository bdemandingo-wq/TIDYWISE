// Session-validated proxy for client-portal self-service operations.
//
// Why this exists: 10 SECURITY DEFINER functions (get_client_portal_bookings,
// get_client_portal_user_data, get_client_portal_requests,
// get_client_portal_notifications, get_client_portal_locations,
// get_client_tax_report, update_client_portal_profile,
// add_client_portal_location, create_client_portal_referral,
// update_client_portal_last_login) were granted EXECUTE to PUBLIC and took
// an id/email straight from the request with no ownership check. The client
// portal has no Supabase Auth session (custom client_portal_users table),
// so every portal browser request is `anon` with no auth.uid() — there is
// no identity available at the Postgres layer to check against, which is
// why an in-function check can't fix this; the identity has to be
// established server-side, here, before any of the 10 functions are called.
//
// This function validates the signed portal session token, then calls the
// underlying SQL functions with the SERVICE ROLE client — using ONLY the
// customer_id/portal_user_id/organization_id resolved from the verified
// session. Any id present in the request body is ignored; the 10 SQL
// functions' own internal logic is otherwise untouched.
//
// get_client_portal_user_data is the one exception: it did an unauthenticated
// email→identity lookup (the actual enumeration primitive — any email, no
// password, returns customer_id/organization_id cross-org). It's not
// proxied; 'get_user_data' below returns the identity already present in
// the verified session instead, so there's no lookup left to abuse.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPortalSession } from "../_shared/portal-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-session",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const session = await verifyPortalSession(req, supabase);
    if (!session.ok) {
      return err(session.error, session.status);
    }
    const { portal_user_id, customer_id, organization_id } = session;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    if (!action) {
      return err("Missing action", 400);
    }

    switch (action) {
      case "get_bookings": {
        const { data, error } = await supabase.rpc("get_client_portal_bookings", {
          p_customer_id: customer_id,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "get_requests": {
        const { data, error } = await supabase.rpc("get_client_portal_requests", {
          p_client_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "get_notifications": {
        const { data, error } = await supabase.rpc("get_client_portal_notifications", {
          p_client_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "get_locations": {
        const { data, error } = await supabase.rpc("get_client_portal_locations", {
          p_customer_id: customer_id,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "get_tax_report": {
        const currentYear = new Date().getUTCFullYear();
        const yearParam = Number(body?.p_year);
        const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam <= currentYear + 1
          ? yearParam
          : currentYear;
        const { data, error } = await supabase.rpc("get_client_tax_report", {
          p_client_user_id: portal_user_id,
          p_year: year,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "update_profile": {
        const firstName = typeof body?.p_first_name === "string" ? body.p_first_name.trim() : "";
        const lastName = typeof body?.p_last_name === "string" ? body.p_last_name.trim() : "";
        if (!firstName || !lastName) {
          return err("First and last name are required", 400);
        }
        const phone = typeof body?.p_phone === "string" && body.p_phone.trim() ? body.p_phone.trim() : null;
        const { data, error } = await supabase.rpc("update_client_portal_profile", {
          p_client_user_id: portal_user_id,
          p_first_name: firstName,
          p_last_name: lastName,
          p_phone: phone,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "add_location": {
        const name = typeof body?.p_name === "string" ? body.p_name.trim() : "";
        const address = typeof body?.p_address === "string" ? body.p_address.trim() : "";
        if (!name || !address) {
          return err("Name and address are required", 400);
        }
        const { data, error } = await supabase.rpc("add_client_portal_location", {
          p_client_user_id: portal_user_id,
          p_name: name,
          p_address: address,
          p_apt_suite: typeof body?.p_apt_suite === "string" && body.p_apt_suite.trim() ? body.p_apt_suite.trim() : null,
          p_city: typeof body?.p_city === "string" && body.p_city.trim() ? body.p_city.trim() : null,
          p_state: typeof body?.p_state === "string" && body.p_state.trim() ? body.p_state.trim() : null,
          p_zip_code: typeof body?.p_zip_code === "string" && body.p_zip_code.trim() ? body.p_zip_code.trim() : null,
          p_latitude: typeof body?.p_latitude === "number" && Math.abs(body.p_latitude) <= 90 ? body.p_latitude : null,
          p_longitude: typeof body?.p_longitude === "number" && Math.abs(body.p_longitude) <= 180 ? body.p_longitude : null,
          p_is_primary: !!body?.p_is_primary,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "create_referral": {
        const email = typeof body?.p_referred_email === "string" ? body.p_referred_email.trim() : "";
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
          return err("A valid email is required", 400);
        }
        const name = typeof body?.p_referred_name === "string" && body.p_referred_name.trim() ? body.p_referred_name.trim() : null;
        const { data, error } = await supabase.rpc("create_client_portal_referral", {
          p_portal_user_id: portal_user_id,
          p_referred_email: email,
          p_referred_name: name,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "update_last_login": {
        const { error } = await supabase.rpc("update_client_portal_last_login", {
          p_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok({ success: true });
      }

      case "get_user_data": {
        // Replaces the old email-lookup RPC entirely — no email accepted
        // here, the identity is whatever the verified session says it is.
        const [{ data: cpu, error: cpuErr }, { data: cust, error: custErr }, { data: loyalty }] = await Promise.all([
          supabase
            .from("client_portal_users")
            .select("id, username, customer_id, organization_id, is_active, must_change_password")
            .eq("id", portal_user_id)
            .maybeSingle(),
          supabase
            .from("customers")
            .select("first_name, last_name, email, phone, referral_code")
            .eq("id", customer_id)
            .maybeSingle(),
          supabase
            .from("customer_loyalty")
            .select("points, lifetime_points, tier")
            .eq("customer_id", customer_id)
            .maybeSingle(),
        ]);
        if (cpuErr) return err(cpuErr.message, 500);
        if (custErr) return err(custErr.message, 500);
        if (!cpu || !cust) return err("Portal account not found", 404);

        return ok([{
          user_id: cpu.id,
          username: cpu.username,
          customer_id: cpu.customer_id,
          organization_id: cpu.organization_id,
          is_active: cpu.is_active,
          must_change_password: cpu.must_change_password,
          first_name: cust.first_name,
          last_name: cust.last_name,
          email: cust.email,
          phone: cust.phone,
          share_referral_code: (cust as any).referral_code ?? null,
          loyalty_points: loyalty?.points ?? null,
          loyalty_lifetime_points: loyalty?.lifetime_points ?? null,
          loyalty_tier: loyalty?.tier ?? null,
          property_type: null,
        }]);
      }

      case "get_referrals": {
        const { data, error } = await supabase
          .from("referrals")
          .select("id, referred_email, referred_name, status, credit_amount, credit_awarded, created_at, completed_at, referral_code")
          .eq("organization_id", organization_id)
          .eq("referrer_customer_id", customer_id)
          .order("created_at", { ascending: false });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[client-portal-api] error:", msg);
    return err(msg, 500);
  }
});
