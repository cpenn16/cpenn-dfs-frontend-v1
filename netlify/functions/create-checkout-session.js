// netlify/functions/create-checkout-session.js
// Minimal, no-trial, cards-only Checkout Session.
// Works without any special payment method configuration.

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY); // MUST be sk_live_... (or sk_test_... in Test)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, email, userId } = JSON.parse(event.body || '{}');

    if (!priceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing priceId' }) };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // keep this simple: cards only; no trials; collect a card now
      payment_method_collection: 'always',
      payment_method_types: ['card'],
      // keep URLs simple & correct
      success_url: `${process.env.PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,

      // pass some context so your webhook can map user -> plan (unchanged)
      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    // surface the real error so you see what's wrong in the browser
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
