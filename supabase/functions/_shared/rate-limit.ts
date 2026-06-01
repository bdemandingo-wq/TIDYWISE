// Simple sliding-window rate limiter backed by public.abuse_throttle.
//
// Usage in an edge function:
//
//   const blocked = await checkAndRecord(supabase, "password_reset",
//     `email:${email}`, { maxPerWindow: 3, windowSeconds: 600 });
//   if (blocked) {
//     // Return a generic "if an account exists..." response so we
//     // don't tell attackers whether the email is real OR whether
//     // they tripped the rate limit. Failing closed silently is the
//     // safest UX here.
//     return jsonOk({ success: true, message: "If an account exists, we'll reach out." });
//   }
//
// Composite key example for stricter scopes:
//   `email:${email}|ip:${getClientIp(req)}`

export interface RateLimitOptions {
  /** How many calls allowed inside the window before blocking. */
  maxPerWindow: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

/**
 * Looks up recent throttle rows for the given bucket. If the count is
 * already at/over the max, returns true (BLOCKED). Otherwise records a
 * fresh row and returns false (ALLOWED).
 *
 * Best-effort: any DB error fails OPEN (returns false) so a transient
 * outage on the throttle table doesn't lock real users out of their
 * own password resets. The caller can also check `error` if it wants
 * to log the failure.
 */
export async function checkAndRecord(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  action: string,
  identifier: string,
  options: RateLimitOptions,
): Promise<{ blocked: boolean; count: number; error?: string }> {
  const bucket = `${action}:${identifier}`;
  const since = new Date(Date.now() - options.windowSeconds * 1000).toISOString();

  try {
    const { count, error: countErr } = await supabase
      .from("abuse_throttle")
      .select("*", { count: "exact", head: true })
      .eq("bucket", bucket)
      .gte("created_at", since);

    if (countErr) {
      console.error(`[rate-limit] count failed for ${bucket}:`, countErr.message);
      return { blocked: false, count: 0, error: countErr.message };
    }

    const seen = count ?? 0;
    if (seen >= options.maxPerWindow) {
      return { blocked: true, count: seen };
    }

    const { error: insertErr } = await supabase
      .from("abuse_throttle")
      .insert({ bucket, action });
    if (insertErr) {
      console.error(`[rate-limit] insert failed for ${bucket}:`, insertErr.message);
      // Already past the count check; let the caller proceed even if the
      // record didn't land. Better to occasionally allow a burst than
      // to block legitimate use on a transient DB hiccup.
      return { blocked: false, count: seen, error: insertErr.message };
    }

    return { blocked: false, count: seen + 1 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[rate-limit] unexpected error for ${bucket}:`, msg);
    return { blocked: false, count: 0, error: msg };
  }
}

/**
 * Pull a best-effort client IP from common proxy headers. Used as the
 * second half of an IP-scoped rate-limit key. Returns "unknown" if no
 * forwarded-for header is present, so the bucket is still distinct from
 * a real IP.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
