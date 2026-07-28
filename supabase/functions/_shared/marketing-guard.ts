/**
 * marketing-guard.ts — single source of truth for "may we send this person marketing?"
 *
 * FAIL CLOSED. TCPA damages are statutory and per-message. Skipping a send we
 * should have made is a support ticket. Making a send we should have skipped is
 * a legal exposure. When the database will not answer, we do not send.
 *
 * Always scope by organization_id — never look a customer up by id alone.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPTED_OUT = "opted_out";

/**
 * Returns true when the customer is opted out of marketing for this org.
 * Returns TRUE on any lookup error (fail closed).
 */
export async function isOptedOut(
  supabase: SupabaseClient,
  organizationId: string,
  customerId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, marketing_status")
      .eq("organization_id", organizationId)
      .eq("id", customerId)
      .maybeSingle();

    if (error) {
      console.error(
        `[marketing-guard] isOptedOut lookup failed — failing closed | org:${organizationId} customer:${customerId} | ${error.message}`,
      );
      return true;
    }

    if (!data) {
      console.error(
        `[marketing-guard] isOptedOut found no customer in org — failing closed | org:${organizationId} customer:${customerId}`,
      );
      return true;
    }

    return data.marketing_status === OPTED_OUT;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[marketing-guard] isOptedOut threw — failing closed | org:${organizationId} customer:${customerId} | ${message}`,
    );
    return true;
  }
}

/**
 * Batch version: one query for the whole list. Returns only customers that are
 * NOT opted out, preserving input order. Returns an EMPTY array on any error.
 */
export async function filterOptedIn<T extends { id: string }>(
  supabase: SupabaseClient,
  organizationId: string,
  customers: T[],
): Promise<T[]> {
  if (!customers || customers.length === 0) return [];

  try {
    const ids = [...new Set(customers.map((c) => c.id))];

    const { data, error } = await supabase
      .from("customers")
      .select("id, marketing_status")
      .eq("organization_id", organizationId)
      .in("id", ids);

    if (error) {
      console.error(
        `[marketing-guard] filterOptedIn lookup failed — failing closed (0 recipients) | org:${organizationId} | ${error.message}`,
      );
      return [];
    }

    const statusById = new Map<string, string | null>(
      (data ?? []).map((row: { id: string; marketing_status: string | null }) => [
        row.id,
        row.marketing_status,
      ]),
    );

    // Customers missing from the org-scoped result are excluded (fail closed).
    return customers.filter(
      (c) => statusById.has(c.id) && statusById.get(c.id) !== OPTED_OUT,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[marketing-guard] filterOptedIn threw — failing closed (0 recipients) | org:${organizationId} | ${message}`,
    );
    return [];
  }
}
