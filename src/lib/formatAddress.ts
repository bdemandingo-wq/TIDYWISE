/**
 * Shared address formatter for the client (mirrors
 * supabase/functions/_shared/format-address.ts on the server).
 *
 * Produces a single-line address that includes the apartment / suite /
 * unit when present, e.g.:
 *   "65 Southwest 12th Avenue, Apt 110, Deerfield Beach, FL 33442"
 */
export interface AddressParts {
  address?: string | null;
  apt_suite?: string | null;
  aptSuite?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  zipCode?: string | null;
}

function normalizeUnit(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(apt|apartment|suite|ste|unit|bldg|building|#)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `Apt ${trimmed}`;
}

export function formatFullAddress(parts: AddressParts | null | undefined): string {
  if (!parts) return "";
  const street = (parts.address ?? "").trim();
  const unitRaw = ((parts.apt_suite ?? parts.aptSuite) ?? "").toString();
  const unit = unitRaw ? normalizeUnit(unitRaw) : "";
  const city = (parts.city ?? "").trim();
  const state = (parts.state ?? "").trim();
  const zip = ((parts.zip_code ?? parts.zipCode) ?? "").toString().trim();

  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ").trim()]
    .filter(Boolean)
    .join(", ");

  return [street, unit, cityStateZip].filter(Boolean).join(", ");
}
