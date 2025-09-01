// netlify/functions/create-checkout-session.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // LIVE key in prod

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { priceId, email, userId, trialDays = 7 } = JSON.parse(event.body || "{}");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",      // collect a card during $0 trial
      allow_promotion_codes: true,
      ...(userId ? { client_reference_id: userId } : {}),
      ...(email ? { customer_email: email } : {}),
      // Put the trial here (Price objects should have NO built-in trial)
      ...(Number(trialDays) > 0
        ? { subscription_data: { trial_period_days: Number(trialDays) } }
        : {}),
      success_url: `${process.env.PUBLIC_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/pricing`,
    });

    return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
  } catch (err) {
    console.error("create-checkout-session error", err);
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }
}
