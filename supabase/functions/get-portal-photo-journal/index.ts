import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyPortalSession } from "../_shared/portal-session.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-session",
};

interface Body {
  client_user_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { client_user_id }: Body = await req.json().catch(() => ({}));
    if (!client_user_id || typeof client_user_id !== "string") {
      return json({ error: "client_user_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate portal user
    const { data: portalUser, error: userErr } = await supabase
      .from("client_portal_users")
      .select("id, customer_id, organization_id, is_active")
      .eq("id", client_user_id)
      .maybeSingle();

    if (userErr) throw userErr;
    if (!portalUser || !portalUser.is_active) {
      return json({ error: "invalid_or_inactive_portal_user" }, 403);
    }

    // Pull photos for this customer's bookings
    const { data: photos, error: photosErr } = await supabase
      .from("booking_photos")
      .select(
        "id, photo_url, photo_type, caption, created_at, media_type, booking_id, staff_id",
      )
      .eq("organization_id", portalUser.organization_id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (photosErr) throw photosErr;

    if (!photos || photos.length === 0) {
      return json({ photos: [], bookings: [] });
    }

    const bookingIds = [...new Set(photos.map((p) => p.booking_id))];

    // Filter bookings to only those for this customer
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select(
        "id, booking_number, scheduled_at, address, status, customer_id, service_id, staff_id",
      )
      .in("id", bookingIds)
      .eq("customer_id", portalUser.customer_id);

    if (bErr) throw bErr;

    const allowedBookingIds = new Set((bookings ?? []).map((b) => b.id));
    const filtered = photos.filter((p) => allowedBookingIds.has(p.booking_id));

    // Hydrate service + staff names
    const serviceIds = [
      ...new Set((bookings ?? []).map((b) => b.service_id).filter(Boolean)),
    ] as string[];
    const staffIds = [
      ...new Set([
        ...(bookings ?? []).map((b) => b.staff_id).filter(Boolean),
        ...filtered.map((p) => p.staff_id).filter(Boolean),
      ]),
    ] as string[];

    const [{ data: services }, { data: staff }] = await Promise.all([
      serviceIds.length
        ? supabase.from("services").select("id, name").in("id", serviceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      staffIds.length
        ? supabase.from("staff").select("id, name").in("id", staffIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const serviceMap = new Map((services ?? []).map((s) => [s.id, s.name]));
    const staffMap = new Map((staff ?? []).map((s) => [s.id, s.name]));
    const bookingMap = new Map((bookings ?? []).map((b) => [b.id, b]));

    // Sign URLs in batch (1h)
    const paths = filtered.map((p) => p.photo_url);
    const { data: signed, error: signErr } = await supabase.storage
      .from("booking-photos")
      .createSignedUrls(paths, 3600);

    if (signErr) throw signErr;

    const signedMap = new Map(
      (signed ?? []).map((s) => [s.path ?? "", s.signedUrl]),
    );

    const result = filtered.map((p) => {
      const b = bookingMap.get(p.booking_id);
      return {
        id: p.id,
        url: signedMap.get(p.photo_url) ?? null,
        photo_type: p.photo_type,
        caption: p.caption,
        media_type: p.media_type,
        taken_at: p.created_at,
        booking_id: p.booking_id,
        booking_number: b?.booking_number ?? null,
        scheduled_at: b?.scheduled_at ?? null,
        address: b?.address ?? null,
        service_name: b?.service_id ? serviceMap.get(b.service_id) ?? null : null,
        staff_name: p.staff_id ? staffMap.get(p.staff_id) ?? null : null,
      };
    });

    return json({ photos: result });
  } catch (e) {
    console.error("get-portal-photo-journal error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
