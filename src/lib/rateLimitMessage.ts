/**
 * What to tell someone who has been rate limited.
 *
 * The portal used to tell them their password was wrong. That is worse than
 * merely untrue: "invalid email or password" is an instruction to try again
 * with different credentials, and trying again is the exact action being
 * throttled. Every retry extended the lockout the message had just provoked.
 *
 * Two things this message must do:
 *   - say plainly that this is NOT a credential failure, because the server
 *     never got as far as checking the password
 *   - give a real duration, so the customer knows whether to wait or come back
 *     later, rather than sitting on the page retrying
 *
 * It must NOT tell them to contact the business. This clears on its own, and
 * routing a self-resolving condition into someone's inbox is how a throttle
 * turns into a support ticket.
 */

/** `retry_after` arrives as seconds. Render it as something a person would say. */
export function formatRetryAfter(seconds: unknown): string | null {
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;

  if (n <= 90) return 'about a minute';
  if (n < 3600) {
    const mins = Math.ceil(n / 60);
    return `about ${mins} minutes`;
  }
  const hours = Math.ceil(n / 3600);
  return hours === 1 ? 'about an hour' : `about ${hours} hours`;
}

/**
 * The full message. `retryAfterSeconds` is optional — the limiter always sends
 * it today, but a message that degrades to "a few minutes" is better than one
 * that depends on a field staying present.
 */
export function rateLimitMessage(retryAfterSeconds?: unknown): string {
  const wait = formatRetryAfter(retryAfterSeconds) ?? 'a few minutes';
  return `Too many sign-in attempts. This is a temporary security limit, not a problem with your password — please wait ${wait} and try again.`;
}
