/**
 * Utility for resolving booking display values
 */

/**
 * Returns the display name for a booking's service.
 * If no service is linked and total_amount is 0, it's a Re-clean.
 */
export function getServiceDisplayName(
  serviceName: string | null | undefined,
  totalAmount?: number | null
): string {
  if (serviceName) return serviceName;
  if (totalAmount === 0 || totalAmount === null || totalAmount === undefined) {
    return 'Re-clean';
  }
  return 'Service';
}
