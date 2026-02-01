// NOTE (performance): Stripe should only be loaded on payment-related screens.
// This module provides a lazy initializer so importing it doesn't pull Stripe into the initial bundle.

type StripePromise = Promise<import('@stripe/stripe-js').Stripe | null>;

const DEFAULT_STRIPE_PUBLISHABLE_KEY =
  'pk_live_51NAFIvJv857o86nokonrv19sgQfuWLJpF2mrM37GiiBki4fmjwGqe1NQobcTJ6LrJ9YDk0vaKYgN7ALAxFJdSf2g00TDRZ9tNw';

let cachedKey: string | null = null;
let cachedPromise: StripePromise | null = null;
let stripeReactModule: typeof import('@stripe/react-stripe-js') | null = null;

function safeGetStoredPublishableKey(): string | null {
  try {
    const key = localStorage.getItem('stripe_publishable_key');
    return key && key.startsWith('pk_') ? key : null;
  } catch {
    return null;
  }
}

/**
 * Lazily loads Stripe.js only when needed.
 * Keeps behavior the same, but avoids pulling Stripe into the initial bundle.
 */
export function getStripePromise(publishableKey?: string): StripePromise {
  const resolvedKey = publishableKey || safeGetStoredPublishableKey() || DEFAULT_STRIPE_PUBLISHABLE_KEY;

  if (cachedPromise && cachedKey === resolvedKey) return cachedPromise;
  cachedKey = resolvedKey;

  cachedPromise = import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(resolvedKey));
  return cachedPromise;
}

/**
 * Pre-load Stripe modules in the background to reduce perceived load time.
 * Call this when navigating to a payment-related screen (e.g. payment step of booking form).
 */
export function preloadStripeModules(): void {
  // Start loading Stripe.js
  getStripePromise();
  
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
