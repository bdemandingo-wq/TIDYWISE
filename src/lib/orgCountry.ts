/**
 * Opportunistic organizations.country_code adoption.
 *
 * country_code defaults to 'US' for every org because the backfill had no
 * reliable signal — company_address is optional free text. Rather than make
 * anyone hunt for a setting, we adopt the country from addresses the org
 * resolves through Google Places.
 *
 * Which addresses count matters. A US business booking one job in Canada
 * must not flip the whole org to CA, so customer and job addresses are
 * deliberately NOT a signal. Only two are:
 *
 *   1. Settings > company_address — the business's own address. Authoritative.
 *   2. Staff home addresses — cleaners live in the market the business
 *      operates in. Weaker, but a US company hiring one cross-border cleaner
 *      is rarer than one booking a cross-border job.
 *
 * And only while the stored value is still the 'US' default, so an explicit
 * choice is never overwritten. That does mean a genuinely-US org can't be
 * "re-adopted" to US — which is a no-op anyway.
 */

import { supabase } from '@/lib/supabase';

const DEFAULT_COUNTRY = 'US';

// One attempt per org per page load. Adoption is best-effort garnish on a
// save the user actually asked for; it must never retry into a loop or
// surface an error.
const attempted = new Set<string>();

/**
 * @param organizationId org to update; no-op when null
 * @param country ISO-3166-1 alpha-2 from AddressAutocomplete's ResolvedAddress
 */
export async function maybeAdoptOrgCountry(
  organizationId: string | null | undefined,
  country: string | null | undefined,
): Promise<void> {
  if (!organizationId) return;
  if (!country || !/^[A-Z]{2}$/.test(country)) return;
  if (country === DEFAULT_COUNTRY) return;

  const key = `${organizationId}:${country}`;
  if (attempted.has(key)) return;
  attempted.add(key);

  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('country_code')
      .eq('id', organizationId)
      .maybeSingle();
    if (error || !data) return;

    // Only ever move off the default. Never overwrite a deliberate choice.
    if ((data as { country_code?: string }).country_code !== DEFAULT_COUNTRY) return;

    await supabase
      .from('organizations')
      .update({ country_code: country })
      .eq('id', organizationId);
  } catch (e) {
    // Best-effort only — never let this break the save it rode in on.
    console.warn('country_code adoption skipped', e);
  }
}
