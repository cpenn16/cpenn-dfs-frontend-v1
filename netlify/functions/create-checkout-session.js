// netlify/functions/create-checkout-session.js
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Basic env checks
  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' }) };
  }
  if (!process.env.PUBLIC_URL) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing PUBLIC_URL' }) };
  }

  try {
    const { priceId, email, userId } = JSON.parse(event.body || '{}');
    if (!priceId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing priceId' }) };
    }

    // Build the Checkout Session payload
    const payload = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',

      // Require billing address + let issuer perform 3DS when appropriate
      billing_address_collection: 'required',
      payment_method_options: { card: { request_three_d_secure: 'automatic' } },

      success_url: `${process.env.PUBLIC_URL}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,
    };

    // If you set a Payment Method Configuration ID in env, pin it (keeps Link OFF)
    if (process.env.STRIPE_PMC_ID) {
      payload.payment_method_configuration = process.env.STRIPE_PMC_ID;
    }

    // Optional context for your webhook
    if (userId) payload.client_reference_id = userId;
    if (email) payload.customer_email = email;

    const session = await stripe.checkout.sessions.create(payload);

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
