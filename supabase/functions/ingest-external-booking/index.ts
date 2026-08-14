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

  // 2b. Resolve extras: the site sends LABELS ("Inside Oven", "Interior Windows ×3"),
  // but the CRM matches on service_pricing.extras[].id. Resolve name -> id here.
  const normalize = (s: string) =>
    s
      .replace(/\s*[x×]\s*\d+\s*$/i, "") // strip " ×3" / " x3" quantity suffix
      .trim()
      .toLowerCase();

  const requestedExtras: string[] = Array.isArray(body.extras)
    ? body.extras
        .map((e: unknown) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object") {
            const o = e as { name?: unknown; id?: unknown };
            if (typeof o.name === "string") return o.name;
            if (typeof o.id === "string") return o.id;
          }
          return "";
        })
        .filter((s: string) => s.trim().length > 0)
    : [];

  const resolvedExtras: string[] = [];
  const droppedExtras: string[] = [];
  const ambiguousExtras: string[] = [];

  if (requestedExtras.length > 0) {
    // Same catalogue-selection rule the app uses: created_at ASC, id ASC,
    // first row that actually carries extras.
    const { data: pricingRows, error: pricingErr } = await supabase
      .from("service_pricing")
      .select("id, extras, created_at")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (pricingErr) {
      return json({ error: "Failed to load extras catalogue", details: pricingErr.message }, 500);
    }

    let catalogue: Array<{ id: string; name: string }> = [];
    for (const row of pricingRows ?? []) {
      const raw = (row as { extras?: unknown }).extras;
      if (Array.isArray(raw) && raw.length > 0) {
        catalogue = raw
          .filter(
            (e: any) =>
              !!e && typeof e === "object" && typeof e.id === "string" && typeof e.name === "string",
          )
          .map((e: any) => ({ id: e.id, name: e.name }));
        break;
      }
    }

    // name -> ids (a catalogue can legitimately carry the same name twice)
    const byName = new Map<string, string[]>();
    const byId = new Set<string>();
    for (const e of catalogue) {
      byId.add(e.id);
      const key = normalize(e.name);
      byName.set(key, [...(byName.get(key) ?? []), e.id]);
    }

    for (const requested of requestedExtras) {
      const key = normalize(requested);

      // Already an id? keep it.
      if (byId.has(requested.trim())) {
        resolvedExtras.push(requested.trim());
        continue;
      }

      const matches = byName.get(key) ?? [];
      if (matches.length === 1) {
        resolvedExtras.push(matches[0]);
      } else if (matches.length > 1) {
        // Ambiguous — never guess. Drop it and report.
        ambiguousExtras.push(requested);
      } else {
        droppedExtras.push(requested);
      }
    }

    if (droppedExtras.length > 0 || ambiguousExtras.length > 0) {
      console.warn(
        "[ingest-external-booking] extras unresolved",
        JSON.stringify({ organization_id, dropped: droppedExtras, ambiguous: ambiguousExtras }),
      );
    }
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
      extras: resolvedExtras,
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
