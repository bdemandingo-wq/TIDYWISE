/**
 * Read the real error message out of a failed `supabase.functions.invoke`.
 *
 * supabase-js collapses every non-2xx response into a FunctionsHttpError whose
 * `.message` is the generic "Edge Function returned a non-2xx status code".
 * The actual reason — "You are not an admin of this organisation", "Portal user
 * not found", "Your email domain is not verified" — is in the response body,
 * which is hanging off `error.context` as an unread Response.
 *
 * So `if (error) throw error` silently discards everything the function took
 * the trouble to say. Every edge function that returns a meaningful message
 * needs its caller to read the body, or that effort is wasted.
 */

interface MaybeFunctionsHttpError {
  message?: string;
  context?: { json?: () => Promise<unknown> };
}

/**
 * The same problem one level down: sometimes the caller needs a FIELD from the
 * body, not just its message.
 *
 * `supabase.functions.invoke` sets `data` to **null** on any non-2xx, so this
 * reads naturally and is always wrong:
 *
 *     const { data, error } = await supabase.functions.invoke(fn, { body });
 *     if (error) {
 *       if (data?.conflict) { … }   // `data` is null here, always
 *     }
 *
 * That exact shape sat in PublicBookingPage's booking submission, so its
 * double-booking branch — meant to say "that time was just booked" and send the
 * customer back to pick another slot — could never fire. Every failure, conflict
 * included, showed one generic message.
 *
 * Returns the parsed object, or null when there is nothing readable. Never throws:
 * failing to read a body must not replace the caller's real error with a second one.
 *
 * Clones the Response before reading, so calling this does NOT consume the body —
 * `readEdgeFunctionError` above still works on the same error afterwards.
 */
export async function readEdgeFunctionErrorBody(
  error: unknown,
): Promise<Record<string, unknown> | null> {
  if (!error || typeof error !== "object") return null;
  const ctx = (error as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return null;

  const asObject = (raw: unknown): Record<string, unknown> | null =>
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  // Newer supabase-js: context is a Response. Clone first — the body is a
  // single-use stream and another reader may want it.
  const maybeResponse = ctx as { clone?: () => { json?: () => Promise<unknown> } };
  if (typeof maybeResponse.clone === "function") {
    try {
      const cloned = maybeResponse.clone();
      if (typeof cloned?.json === "function") return asObject(await cloned.json());
    } catch {
      // Not JSON, or already consumed. Fall through to the older shape.
    }
  }

  // Older supabase-js: context.body is a plain string.
  const maybeLegacy = ctx as { body?: unknown };
  if (typeof maybeLegacy.body === "string" && maybeLegacy.body.trim()) {
    try {
      return asObject(JSON.parse(maybeLegacy.body));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * The first human-readable message out of a zod `flatten().fieldErrors` object.
 *
 * Functions validating with zod return `{ error: "Invalid input", details: {
 * phone: ["Required"] } }`. A customer is far better served by "Required" against
 * the field than by "Invalid input" on its own.
 */
export function firstFieldError(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  for (const value of Object.values(details as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === "string" && v.trim().length > 0);
      if (typeof first === "string") return first;
    } else if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Returns the function's own error message when it sent one, otherwise the
 * supplied fallback. Never throws — it is called from a catch path.
 *
 * `fallback` is REQUIRED, deliberately. It defaulted to "Something went wrong",
 * which is filler: it names nothing, suggests nothing, and reads identically
 * whether a card was declined or a server fell over. Every call site knows what
 * it was attempting and can say so; making the parameter required means the
 * compiler finds anywhere that forgot, instead of quietly substituting a string
 * that helps nobody.
 */
export async function readEdgeFunctionError(
  error: unknown,
  fallback: string,
): Promise<string> {
  const err = error as MaybeFunctionsHttpError | null;

  const context = err?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.json()) as { error?: unknown; message?: unknown } | null;
      const fromBody = body?.error ?? body?.message;
      if (typeof fromBody === "string" && fromBody.trim()) return fromBody;
    } catch {
      // Body was not JSON, or was already consumed. Fall through.
    }
  }

  // Don't surface supabase-js's generic wrapper as if it explained anything.
  const raw = typeof err?.message === "string" ? err.message : "";
  if (raw && !/non-2xx status code/i.test(raw)) return raw;

  return fallback;
}
