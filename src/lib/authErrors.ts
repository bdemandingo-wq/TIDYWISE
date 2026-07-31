/**
 * Is this error proof that the session is actually invalid?
 *
 * The question matters because the answer decides whether we end someone's
 * session. `supabase.auth.getUser()` does NOT throw on network or server
 * failures — it returns `{ data: { user: null }, error }` for an unreachable
 * auth server exactly as it does for a rejected JWT. Treating those the same
 * meant a Supabase blip, a captive portal or a flaky mobile connection signed
 * the user out, and the code that did it carried a comment claiming network
 * errors were tolerated.
 *
 * So this is an ALLOWLIST, and the default is `false`. Anything unrecognised
 * keeps the session. The cost of a wrong `false` is one skipped subscription
 * check; the cost of a wrong `true` is throwing a paying customer out of the
 * app. Those are not comparable, so the tie goes to keeping the session.
 */

/** Auth error codes that mean the token/session is genuinely gone. */
const INVALID_SESSION_CODES = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'user_not_found',
  'user_banned',
]);

interface MaybeAuthError {
  name?: unknown;
  status?: unknown;
  code?: unknown;
  message?: unknown;
}

export function isInvalidSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as MaybeAuthError;

  const name = typeof e.name === 'string' ? e.name : '';
  const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : null;

  // supabase-js raises this for fetch failures and retryable server responses.
  // It is never evidence about the token.
  if (name === 'AuthRetryableFetchError') return false;

  // The auth server having a bad day says nothing about the credential.
  // 429 likewise — being rate limited is not being logged out.
  if (status !== null && (status >= 500 || status === 429)) return false;

  // A fetch that never reached a server has no status at all. Keep the session.
  if (status === null && (message.includes('failed to fetch') ||
                          message.includes('networkerror') ||
                          message.includes('network request failed') ||
                          message.includes('load failed'))) {
    return false;
  }

  if (INVALID_SESSION_CODES.has(code)) return true;

  // 401/403 from the auth endpoint means the JWT itself was rejected.
  if (status === 401 || status === 403) return true;

  // Older supabase-js versions surfaced these as messages without a code.
  if (message.includes('auth session missing') ||
      message.includes('session_not_found') ||
      message.includes('invalid claim') ||
      message.includes('jwt expired') ||
      message.includes('invalid jwt')) {
    return true;
  }

  return false;
}
