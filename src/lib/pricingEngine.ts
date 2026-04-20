/**
 * Centralized pricing engine — single source of truth for base price calculation
 * across the admin booking form, the public booking form, and any future surface.
 *
 * Behavior:
 *  - combinedPricingEnabled = false (default): base = sqftPart OR bedBathPart (whichever
 *    the booking surface picked, preserving existing either/or behavior).
 *  - combinedPricingEnabled = true: base = sqftPart + bedBathPart (additive).
 *
 * This ALWAYS falls back gracefully — missing pieces resolve to 0, and a configured
 * minimum_price is applied at the end.
 */

import { squareFootageRanges } from '@/data/pricingData';

export interface PricingEngineInput {
  /** Tier prices indexed by squareFootageRanges position. */
  sqftPrices?: number[];
  /** Bedroom/bath grid stored on the service. */
  bedroomPricing?: Array<{
    bedrooms: string | number;
    bathrooms: string | number;
    basePrice: number;
  }>;
  /** Optional minimum floor for the base price (before extras/modifiers). */
  minimumPrice?: number;
  /** Selected sqft tier label (e.g. "1500-1999") OR raw index — either is accepted. */
  squareFootageLabel?: string | null;
  squareFootageIndex?: number | null;
  /** Selected bed/bath. Strings accepted to match historical data shape. */
  bedrooms?: string | number | null;
  bathrooms?: string | number | null;
  /** Org-level toggle. Defaults to false (legacy behavior). */
  combinedPricingEnabled?: boolean;
  /**
   * Which mode the booking surface is currently using. Only consulted when
   * combinedPricingEnabled = false (legacy either/or behavior).
   */
  pricingMode?: 'sqft' | 'bedroom';
  /** Optional fallback when nothing else resolves (e.g. service.price). */
  fallbackBasePrice?: number;
}

export interface PricingEngineResult {
  base: number;
  sqftPart: number;
  bedBathPart: number;
  /** True if the org-level combined toggle was honored. */
  combinedApplied: boolean;
}

function resolveSqftPart(input: PricingEngineInput): number {
  const prices = input.sqftPrices ?? [];
  if (prices.length === 0) return 0;

  let idx = input.squareFootageIndex ?? -1;
  if (idx < 0 && input.squareFootageLabel) {
    idx = squareFootageRanges.findIndex((r) => r.label === input.squareFootageLabel);
  }
  if (idx < 0 || idx >= prices.length) return 0;
  return Number(prices[idx]) || 0;
}

function resolveBedBathPart(input: PricingEngineInput): number {
  const grid = input.bedroomPricing ?? [];
  if (grid.length === 0) return 0;
  if (input.bedrooms == null || input.bathrooms == null) return 0;

  const bed = String(input.bedrooms);
  const bath = String(input.bathrooms);
  const match = grid.find(
    (p) => String(p.bedrooms) === bed && String(p.bathrooms) === bath,
  );
  return match ? Number(match.basePrice) || 0 : 0;
}

export function calculateBasePrice(input: PricingEngineInput): PricingEngineResult {
  const sqftPart = resolveSqftPart(input);
  const bedBathPart = resolveBedBathPart(input);
  const combined = !!input.combinedPricingEnabled;

  let base = 0;

  if (combined) {
    // Additive mode — the headline behavior of this feature.
    base = sqftPart + bedBathPart;
  } else {
    // Legacy either/or — preserve existing behavior for orgs that haven't opted in.
    if (input.pricingMode === 'bedroom') {
      base = bedBathPart || sqftPart; // graceful fallback
    } else {
      base = sqftPart || bedBathPart;
    }
  }

  // Last-resort fallback (e.g. service.price) so we never regress to $0 silently.
  if (base === 0 && input.fallbackBasePrice && input.fallbackBasePrice > 0) {
    base = input.fallbackBasePrice;
  }

  // Apply minimum price floor — only if we have a real base to begin with.
  if (input.minimumPrice && base > 0 && base < input.minimumPrice) {
    base = input.minimumPrice;
  }

  return { base, sqftPart, bedBathPart, combinedApplied: combined };
}
