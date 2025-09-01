// netlify/functions/create-checkout-session.js
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, email, userId, trialDays = 7 } = JSON.parse(event.body || '{}');

    const payload = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      billing_address_collection: 'required',
      allow_promotion_codes: true,

      // If you set STRIPE_PMC_ID (cards-only config), use that; otherwise force types=['card']
      ...(process.env.STRIPE_PMC_ID
        ? { payment_method_configuration: process.env.STRIPE_PMC_ID }
        : { payment_method_types: ['card'] }),

      // 🔐 Force 3DS to see if issuer approves when challenged
      payment_method_options: { card: { request_three_d_secure: 'any' } },

      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
      ...(Number(trialDays) > 0 ? { subscription_data: { trial_period_days: Number(trialDays) } } : {}),
      success_url: `${process.env.PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,
    };

    const session = await stripe.checkout.sessions.create(payload);
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
