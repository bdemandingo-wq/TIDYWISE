/**
 * Mint-or-fetch the unsubscribe token for an email address.
 *
 * public.email_unsubscribe_tokens.email is UNIQUE, so both this and the
 * existing minting inside _shared/emailEligibility.ts converge on the same
 * row — a broadcast and a Morning Brief hand out the same link.
 *
 * Left as an additive module rather than refactoring emailEligibility: the
 * briefs are the only email path in the system that currently honours
 * opt-out, and there is no user-visible benefit to touching them here.
 * Follow-up: fold emailEligibility onto this helper.
 */
export async function ensureUnsubscribeToken(
  supabase: { from: (t: string) => any },
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', normalized)
    .maybeSingle();
  if (existing?.token) return existing.token;

  const token = crypto.randomUUID().replace(/-/g, '');
  const { error } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ email: normalized, token });

  if (error) {
    // 23505 means a concurrent mint won the race — re-read rather than fail,
    // because a missing token would silently downgrade a marketing send into
    // one with no way out.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('email_unsubscribe_tokens')
        .select('token')
        .eq('email', normalized)
        .maybeSingle();
      return raced?.token ?? null;
    }
    console.error('[unsubscribe-token] mint failed', { error });
    return null;
  }
  return token;
}
