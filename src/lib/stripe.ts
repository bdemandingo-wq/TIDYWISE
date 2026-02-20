// NOTE (performance): Stripe should only be loaded on payment-related screens.
// This module provides a lazy initializer so importing it doesn't pull Stripe into the initial bundle.

type StripePromise = Promise<import('@stripe/stripe-js').Stripe | null>;

// REMOVED: No global default Stripe key. Each organization must provide its own
// publishable key via org_stripe_settings. This prevents cross-org payment routing.

let cachedKey: string | null = null;
let cachedPromise: StripePromise | null = null;
let stripeReactModule: typeof import('@stripe/react-stripe-js') | null = null;

/**
 * Lazily loads Stripe.js only when needed.
 * A publishableKey MUST be provided — there is no global fallback.
 * This enforces strict org isolation for payments.
 */
export function getStripePromise(publishableKey?: string): StripePromise {
  if (!publishableKey) {
    console.error('[stripe] No publishable key provided — cannot initialize Stripe without org-specific key');
    return Promise.resolve(null);
  }

  if (cachedPromise && cachedKey === publishableKey) return cachedPromise;
  cachedKey = publishableKey;

  cachedPromise = import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(publishableKey));
  return cachedPromise;
}

/**
 * Pre-load Stripe modules in the background to reduce perceived load time.
 * Call this when navigating to a payment-related screen (e.g. payment step of booking form).
 * Note: This only preloads the JS module, NOT a Stripe instance (requires org key).
 */
export function preloadStripeModules(): void {
  // Start loading @stripe/react-stripe-js
  if (!stripeReactModule) {
    import('@stripe/react-stripe-js')
      .then((m) => {
        stripeReactModule = m;
      })
      .catch((err) => {
        console.error('Failed to preload Stripe React:', err);
      });
  }
}

/**
 * Get cached Stripe React module if available.
 */
export function getCachedStripeReact(): typeof import('@stripe/react-stripe-js') | null {
  return stripeReactModule;
}

/**
 * Set the cached Stripe React module (called from StripeCardForm after loading).
 */
export function setCachedStripeReact(module: typeof import('@stripe/react-stripe-js')): void {
  stripeReactModule = module;
}
