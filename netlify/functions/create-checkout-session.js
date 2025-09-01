// netlify/functions/create-checkout-session.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, email, userId } = JSON.parse(event.body || '{}');
    if (!priceId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing priceId' }) };

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',

      // IMPORTANT: Pin to your config where Link is OFF.
      // Do NOT also send payment_method_types when using a configuration.
      payment_method_configuration: process.env.STRIPE_PMC_ID,

      // Help issuers approve: collect address + allow 3DS challenge when available
      billing_address_collection: 'required',
      // netlify/functions/create-checkout-session.js
      payment_method_options: { card: { request_three_d_secure: 'automatic' } },


      success_url: `${process.env.PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,

      // Context for your webhook
      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
