// Public ingest endpoint for bookings coming from an external Lovable site.
// Auth: shared secret in `x-api-key` header must match EXTERNAL_BOOKING_INGEST_KEY.
// Target org: EXTERNAL_BOOKING_ORG_ID secret (or `organization_id` in body if same key).
//
// POST JSON body fields (all optional unless noted):
//   name           string  (required) — full customer name
//   first_name     string
//   last_name      string
//   email          string  (required)
//   phone          string
//   address        string
//   city           string
//   state          string
//   zip_code       string
//   service        string  — name of service to match (or service_id uuid)
//   service_id     string  uuid
//   scheduled_at   string  ISO datetime (required)
//   duration       number  minutes, defaults 120
//   total_amount   number  defaults 0
//   notes          string
//   frequency      string  one_time | weekly | biweekly | monthly
//   bedrooms       string
//   bathrooms      string
//   square_footage string
//   extras         array
//   stripe_customer_id        string — saved on the customer record, reused across bookings
//   stripe_payment_method_id  string — saved on the customer record, reused across bookings
//   organization_id string uuid — only honored if no EXTERNAL_BOOKING_ORG_ID is set

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedKey = Deno.env.get("EXTERNAL_BOOKING_INGEST_KEY");
  if (!expectedKey) return json({ error: "Ingest key not configured" }, 500);

  const provided = req.headers.get("x-api-key") || "";
  if (provided !== expectedKey) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Resolve target org
  const orgFromSecret = Deno.env.get("EXTERNAL_BOOKING_ORG_ID");
  const organization_id = orgFromSecret || body.organization_id;
  if (!organization_id) return json({ error: "No target organization_id configured" }, 400);

  // Required fields
  const email: string | undefined = body.email?.toString().trim().toLowerCase();
  const scheduledAtRaw: string | undefined = body.scheduled_at;
  const nameRaw: string | undefined = body.name || [body.first_name, body.last_name].filter(Boolean).join(" ").trim() || undefined;

  if (!email) return json({ error: "email is required" }, 400);
  if (!scheduledAtRaw) return json({ error: "scheduled_at is required (ISO datetime)" }, 400);
  if (!nameRaw) return json({ error: "name (or first_name/last_name) is required" }, 400);

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) return json({ error: "scheduled_at is not a valid date" }, 400);

  const first_name = (body.first_name || nameRaw.split(/\s+/)[0] || "Customer").toString();
  const last_name = (body.last_name || nameRaw.split(/\s+/).slice(1).join(" ") || "—").toString();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Optional saved-card references (stored on the customer, reused across bookings)
  const stripeCustomerId: string | null =
    typeof body.stripe_customer_id === "string" && body.stripe_customer_id.trim()
      ? body.stripe_customer_id.trim()
      : null;
  const stripePaymentMethodId: string | null =
    typeof body.stripe_payment_method_id === "string" && body.stripe_payment_method_id.trim()
      ? body.stripe_payment_method_id.trim()
      : null;

  // 1. Find or create customer (scoped to org + email)
  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("email", email)
    .maybeSingle();

  if (existingCustomer?.id) {
    customerId = existingCustomer.id;
    // Only overwrite card refs when new ones were supplied
    const cardUpdate: Record<string, string> = {};
    if (stripeCustomerId) cardUpdate.stripe_customer_id = stripeCustomerId;
    if (stripePaymentMethodId) cardUpdate.stripe_payment_method_id = stripePaymentMethodId;
    if (Object.keys(cardUpdate).length > 0) {
      const { error: cardErr } = await supabase
        .from("customers")
        .update(cardUpdate)
        .eq("id", customerId)
        .eq("organization_id", organization_id);
      if (cardErr) console.error("[ingest-external-booking] Failed to save card refs:", cardErr.message);
    }
  } else {
    const { data: newCustomer, error: custErr } = await supabase
      .from("customers")
      .insert({
        organization_id,
        first_name,
        last_name,
        email,
        phone: body.phone ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        zip_code: body.zip_code ?? null,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: stripePaymentMethodId,
      })
      .select("id")
      .single();
    if (custErr) return json({ error: "Failed to create customer", details: custErr.message }, 500);
    customerId = newCustomer.id;
  }

  // 2. Resolve optional service
  let serviceId: string | null = body.service_id ?? null;
  if (!serviceId && body.service) {
    const { data: svc } = await supabase
      .from("services")
      .select("id")
      .eq("organization_id", organization_id)
      .ilike("name", body.service.toString())
      .maybeSingle();
    serviceId = svc?.id ?? null;
  }

  // 3. Insert booking
  const { data: booking, error: bookErr } = await supabase
    .from("bookings")
    .insert({
      organization_id,
      customer_id: customerId,
      service_id: serviceId,
      scheduled_at: scheduledAt.toISOString(),
      duration: Number.isFinite(+body.duration) ? +body.duration : 120,
      total_amount: Number.isFinite(+body.total_amount) ? +body.total_amount : 0,
      status: "confirmed",
      payment_status: "pending",
      customer_notes: body.notes ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip_code: body.zip_code ?? null,
      frequency: body.frequency ?? "one_time",
      bedrooms: body.bedrooms?.toString() ?? "1",
      bathrooms: body.bathrooms?.toString() ?? "1",
      square_footage: body.square_footage?.toString() ?? null,
      extras: Array.isArray(body.extras) ? body.extras : [],
    })
    .select("id, booking_number, scheduled_at")
    .single();

  if (bookErr) return json({ error: "Failed to create booking", details: bookErr.message }, 500);

  return json({
    ok: true,
    booking_id: booking.id,
    booking_number: booking.booking_number,
    scheduled_at: booking.scheduled_at,
    customer_id: customerId,
  });
});
