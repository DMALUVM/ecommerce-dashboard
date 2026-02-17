// api/stripe/create-checkout-session.js — Creates a Stripe Checkout session for Pro subscription
import Stripe from 'stripe';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID } = process.env;
  if (!STRIPE_SECRET_KEY || !STRIPE_PRO_PRICE_ID) {
    return res.status(500).json({ error: 'Stripe is not configured.' });
  }

  try {
    const { userId, email, returnUrl } = req.body || {};
    if (!userId || !email) {
      return res.status(400).json({ error: 'userId and email are required.' });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const baseUrl = returnUrl || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: email,
      client_reference_id: userId,
      line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${baseUrl}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/#pricing`,
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe/create-checkout-session] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
