/**
 * Shared address formatter for all customer-facing notifications (SMS + email).
 *
 * Produces a single-line comma-separated address that includes the
 * apartment / suite / unit whenever it is present, e.g.
 *   "65 Southwest 12th Avenue, Apt 110, Deerfield Beach, FL 33442"
 *
 * All fields are optional; empties are dropped. The apt/suite value is
 * used verbatim if it already looks labeled (starts with "apt", "suite",
 * "ste", "unit", "#"); otherwise it is prefixed with "Apt ".
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

function buildAddress(parts: AddressParts | null | undefined): string {
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

/**
 * `fallback` is consulted ONLY when the primary parts produce nothing at all.
 *
 * A booking carries its own address because a customer can book a second
 * property. So the booking always wins when it has one, and the customer
 * record is a last resort rather than a merge — mixing a booking's street
 * with a customer's city would invent an address that exists nowhere.
 *
 * This matters because the alternative is worse than blank. Callers that
 * print a placeholder send a cleaner "Address: Address not provided" for a
 * job whose address the database is holding one table away.
 *
 * Opt-in by design: single-argument callers are byte-for-byte unchanged, so
 * adopting this is a decision each sender makes rather than a silent change
 * to every message the system sends.
 */
export function formatFullAddress(
  parts: AddressParts | null | undefined,
  fallback?: AddressParts | null,
): string {
  const primary = buildAddress(parts);
  if (primary) return primary;
  return buildAddress(fallback);
}
