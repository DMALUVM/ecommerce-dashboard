// api/stripe/create-portal-session.js — Creates a Stripe Customer Portal session for billing management
import Stripe from 'stripe';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { STRIPE_SECRET_KEY } = process.env;
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe is not configured.' });
  }

  try {
    const { customerId, returnUrl } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required.' });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY);
    const baseUrl = returnUrl || `https://${req.headers.host}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/app`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('[stripe/create-portal-session] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
