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
 * Returns the function's own error message when it sent one, otherwise the
 * supplied fallback. Never throws — it is called from a catch path.
 */
export async function readEdgeFunctionError(
  error: unknown,
  fallback = "Something went wrong",
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
