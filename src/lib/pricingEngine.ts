/**
 * Centralized pricing engine — single source of truth for base price calculation
 * across the admin booking form, the public booking form, and any future surface.
 *
 * Behavior (legacy either/or):
 *   base = pricingMode === 'bedroom'
 *     ? (bedBathPart || sqftPart)
 *     : (sqftPart || bedBathPart);
 * Then fallbackBasePrice is applied if base resolved to 0, then minimumPrice
 * is applied as a floor.
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
  /** Which mode the booking surface is currently using. */
  pricingMode?: 'sqft' | 'bedroom';
  /** Optional fallback when nothing else resolves (e.g. service.price). */
  fallbackBasePrice?: number;
}

export interface PricingEngineResult {
  base: number;
  sqftPart: number;
  bedBathPart: number;
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

  // Legacy either/or — graceful fallback between the two modes.
  let base =
    input.pricingMode === 'bedroom'
      ? bedBathPart || sqftPart
      : sqftPart || bedBathPart;

  // Last-resort fallback (e.g. service.price) so we never regress to $0 silently.
  if (base === 0 && input.fallbackBasePrice && input.fallbackBasePrice > 0) {
    base = input.fallbackBasePrice;
  }

  // Apply minimum price floor — only if we have a real base to begin with.
  if (input.minimumPrice && base > 0 && base < input.minimumPrice) {
    base = input.minimumPrice;
  }

  return { base, sqftPart, bedBathPart };
}
