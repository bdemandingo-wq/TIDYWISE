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
import Stripe from "https://esm.sh/stripe@18.5.0";
import { getOrgStripeClient } from "../_shared/get-org-stripe-settings.ts";
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
            .select("points, lifetime_points, tier, lifetime_spend")
            .eq("customer_id", customer_id)
            .maybeSingle(),
        ]);
        if (cpuErr) return err(cpuErr.message, 500);
        if (custErr) return err(custErr.message, 500);
        if (!cpu || !cust) return err("Portal account not found", 404);

        // Tier is DERIVED — customer_loyalty.tier is frozen and goes stale as
        // soon as an org edits its thresholds. A NULL from the resolver means
        // the customer is below the org's lowest min_spending; pass it through.
        // On resolver failure, fail visibly rather than serving a stale or
        // silently-missing tier.
        const { data: derivedTier, error: tierErr } = await supabase.rpc(
          "resolve_customer_tier",
          { p_customer_id: customer_id },
        );
        if (tierErr) return err(`Failed to resolve loyalty tier: ${tierErr.message}`, 500);

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
          loyalty_tier: derivedTier ?? null,
          loyalty_lifetime_spend: (loyalty as any)?.lifetime_spend ?? null,
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

      case "change_password": {
        const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
        if (!currentPassword || !newPassword) {
          return err("Current and new password are required", 400);
        }
        if (newPassword.length < 8) {
          return err("New password must be at least 8 characters", 400);
        }

        // Rate limit: 5 FAILED attempts per portal user per 15 minutes.
        // Stored in public.abuse_throttle (the existing shared rate-limit
        // table) — an in-memory Map would reset when the instance recycles.
        const bucket = `portal_password_change_fail:${portal_user_id}`;
        const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { count: failCount } = await supabase
          .from("abuse_throttle")
          .select("*", { count: "exact", head: true })
          .eq("bucket", bucket)
          .gte("created_at", since);
        if ((failCount ?? 0) >= 5) {
          console.warn(`[client-portal-api] change_password rate limited portal_user_id=${portal_user_id}`);
          return err("Too many attempts. Try again in a few minutes.", 429);
        }

        const { data, error } = await supabase.rpc("change_client_portal_password", {
          p_user_id: portal_user_id,
          p_current_password: currentPassword,
          p_new_password: newPassword,
        });
        if (error) return err(error.message, 500);

        const result = (Array.isArray(data) ? data[0] : data) as
          | { success?: boolean; error?: string }
          | null;

        if (!result?.success) {
          // Collapse 'User not found' and 'Current password is incorrect'
          // into one client-facing message — distinct strings are a
          // user-enumeration oracle. Real distinction logged server-side.
          console.warn(
            `[client-portal-api] change_password failed portal_user_id=${portal_user_id} reason=${result?.error ?? "unknown"}`,
          );
          await supabase.from("abuse_throttle").insert({
            bucket,
            action: "portal_password_change_fail",
          });
          return ok({ success: false, error: "Current password is incorrect" });
        }

        // Success resets the failure counter.
        await supabase.from("abuse_throttle").delete().eq("bucket", bucket);
        return ok({ success: true });
      }

      case "cancel_booking": {
        const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : "";
        if (!bookingId) return err("bookingId is required", 400);
        const { data, error } = await supabase.rpc("client_cancel_booking", {
          p_booking_id: bookingId,
          p_customer_id: customer_id,
        });
        if (error) return err(error.message, 500);
        // Returned verbatim — the frontend reads success / error /
        // within_48_hours off this shape.
        return ok(data);
      }

      case "mark_notification_read": {
        const notificationId = typeof body?.notificationId === "string" ? body.notificationId.trim() : "";
        if (!notificationId) return err("notificationId is required", 400);
        const { data, error } = await supabase.rpc("mark_client_notification_read", {
          p_notification_id: notificationId,
          p_client_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "delete_notification": {
        const notificationId = typeof body?.notificationId === "string" ? body.notificationId.trim() : "";
        if (!notificationId) return err("notificationId is required", 400);
        const { data, error } = await supabase.rpc("delete_client_portal_notification", {
          p_notification_id: notificationId,
          p_client_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "delete_booking_request": {
        const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
        if (!requestId) return err("requestId is required", 400);
        const { data, error } = await supabase.rpc("delete_client_booking_request", {
          p_request_id: requestId,
          p_client_user_id: portal_user_id,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "delete_location": {
        const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : "";
        if (!locationId) return err("locationId is required", 400);
        const { data, error } = await supabase.rpc("delete_client_portal_location", {
          p_client_user_id: portal_user_id,
          p_location_id: locationId,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "update_location": {
        // Address CORRECTION only. Identity comes from the VERIFIED SESSION;
        // only locationId + address fields are taken from the body.
        const locationId = typeof body?.locationId === "string" ? body.locationId.trim() : "";
        if (!locationId) return err("locationId is required", 400);

        const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

        const { data, error } = await supabase.rpc("update_client_portal_location", {
          p_client_user_id: portal_user_id,
          p_customer_id: customer_id,
          p_location_id: locationId,
          p_name: str(body?.name),
          p_address: str(body?.address),
          p_apt_suite: str(body?.aptSuite ?? body?.apt_suite),
          p_city: str(body?.city),
          p_state: str(body?.state),
          p_zip_code: str(body?.zipCode ?? body?.zip_code),
          p_latitude: num(body?.latitude),
          p_longitude: num(body?.longitude),
        });
        if (error) return err(error.message, 500);
        if (data === false) return err("Address not found", 404);
        return ok({ success: true });
      }



      case "submit_booking_request": {
        const requestedDate = typeof body?.requestedDate === "string" ? body.requestedDate.trim() : "";
        if (!requestedDate || Number.isNaN(Date.parse(requestedDate))) {
          return err("A valid requestedDate is required", 400);
        }
        const serviceId = typeof body?.serviceId === "string" && body.serviceId.trim() ? body.serviceId.trim() : null;
        const notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
        const locationId = typeof body?.locationId === "string" && body.locationId.trim() ? body.locationId.trim() : null;
        // 7-arg overload called explicitly.
        const { data, error } = await supabase.rpc("submit_client_booking_request", {
          p_client_user_id: portal_user_id,
          p_customer_id: customer_id,
          p_organization_id: organization_id,
          p_requested_date: requestedDate,
          p_service_id: serviceId,
          p_notes: notes,
          p_location_id: locationId,
        });
        if (error) return err(error.message, 500);
        return ok(data);
      }

      case "get_loyalty_tiers": {
        // organization_id comes from the VERIFIED SESSION, never the body.
        const { data, error } = await supabase.rpc("get_loyalty_tier_info", {
          p_organization_id: organization_id,
        });
        if (error) return err(error.message, 500);
        return ok(data ?? []);
      }

      case "request_email_change": {
        // NOTIFY ONLY. Never modifies customers.email or client_portal_users.
        const raw = typeof body?.p_new_email === "string" ? body.p_new_email : "";
        const newEmail = raw.trim().toLowerCase();

        // Loose validation on purpose: an admin confirms before acting.
        if (
          !newEmail || newEmail.length > 320 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
        ) {
          return err("A valid email address is required", 400);
        }

        // Identity from the VERIFIED SESSION only.
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .select("first_name, last_name, email")
          .eq("id", customer_id)
          .maybeSingle();
        if (custErr) return err(custErr.message, 500);
        if (!cust) return err("Customer not found", 404);

        const currentEmail = (cust.email ?? "").trim().toLowerCase();
        if (currentEmail && currentEmail === newEmail) {
          return err("That is already your email address", 400);
        }

        const customerName =
          `${cust.first_name ?? ""} ${cust.last_name ?? ""}`.trim() || "A customer";

        const { error: notifyErr } = await supabase
          .from("admin_system_notifications")
          .insert({
            organization_id,
            type: "email_change_request",
            title: "Email change requested",
            message:
              `${customerName} asked to change their sign-in email from ` +
              `${currentEmail || "(none on file)"} to ${newEmail}`,
            link: `/dashboard/customers?customer=${customer_id}`,
            metadata: {
              customer_id,
              current_email: currentEmail,
              requested_email: newEmail,
              source: "client_portal",
            },
            dedupe_key: `email_change_req:${customer_id}:${newEmail}`,
          });

        // 23505 = already recorded → success from the customer's point of view.
        if (notifyErr && (notifyErr as { code?: string }).code !== "23505") {
          return err(notifyErr.message, 500);
        }

        return ok({ success: true });
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
