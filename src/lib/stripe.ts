import { loadStripe } from '@stripe/stripe-js';

// Stripe publishable key
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51NAFIvJv857o86nokonrv19sgQfuWLJpF2mrM37GiiBki4fmjwGqe1NQobcTJ6LrJ9YDk0vaKYgN7ALAxFJdSf2g00TDRZ9tNw';

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
