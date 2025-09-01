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

      // 👇 Force card-only (overrides config)
      payment_method_types: ['card'],

      // 👇 Helps banks/AVS & makes customer record consistent
      billing_address_collection: 'required',
      customer_creation: 'always',

      allow_promotion_codes: true,
      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
      ...(Number(trialDays) > 0
        ? { subscription_data: { trial_period_days: Number(trialDays) } }
        : {}),
      success_url: `${process.env.PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,
    };

    // Optional: if you set STRIPE_PMC_ID to a config with only Cards enabled,
    // you can pin to it here to guarantee no Link/Klarna/Amazon Pay show up.
    if (process.env.STRIPE_PMC_ID) {
      payload.payment_method_configuration = process.env.STRIPE_PMC_ID;
    }

    const session = await stripe.checkout.sessions.create(payload);
    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
