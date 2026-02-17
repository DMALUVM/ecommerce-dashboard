// Client-side Stripe helpers
import { loadStripe } from '@stripe/stripe-js';

let stripePromise = null;

/** Lazily load the Stripe.js instance */
export function getStripe() {
  if (!stripePromise) {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn('[stripe] VITE_STRIPE_PUBLISHABLE_KEY not set');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/** Redirect to Stripe Checkout for Pro subscription */
export async function redirectToCheckout(userId, email) {
  const res = await fetch('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email, returnUrl: window.location.origin }),
  });

  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  } else {
    throw new Error(data.error || 'Failed to create checkout session');
  }
}

/** Redirect to Stripe Customer Portal for billing management */
export async function redirectToPortal(customerId) {
  const res = await fetch('/api/stripe/create-portal-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, returnUrl: window.location.origin }),
  });

  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  } else {
    throw new Error(data.error || 'Failed to create portal session');
  }
}
