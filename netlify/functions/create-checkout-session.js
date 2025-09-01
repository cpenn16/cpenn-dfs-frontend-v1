const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, email, userId } = JSON.parse(event.body || '{}');

    const payload = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: 'always',
      billing_address_collection: 'required',
      allow_promotion_codes: true,
      // Pin to your Cards (+ Apple/Google Pay) configuration if you set it:
      ...(process.env.STRIPE_PMC_ID ? { payment_method_configuration: process.env.STRIPE_PMC_ID } : {}),
      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
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
