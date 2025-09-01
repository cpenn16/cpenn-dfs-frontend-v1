// netlify/functions/stripe-webhook.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// Service-role key so we can update profiles server-side
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---- MAP YOUR LIVE PRICE IDs -> INTERNAL PLAN CODES ----
// Make sure these exactly match your live prices and the plan strings your UI expects.
const PLAN_MAP = {
  // LITE
  "price_1S1MSuRuMf2a9EBN2z4AhmHv": "MLB_LITE",
  "price_1S1MUZRuMf2a9EBNDbrh048G": "NASCAR_LITE",
  "price_1S1MVBRuMf2a9EBN2oFSEa4o": "NFL_LITE",
  "price_1S1MVmRuMf2a9EBNGyCBzKXh": "NBA_LITE",

  // PRO
  "price_1S1MWORuMf2a9EBN0sYILLhZ": "MLB_PRO",
  "price_1S1MXJRuMf2a9EBN8gL43fpy": "NASCAR_PRO",
  "price_1S1MXxRuMf2a9EBNKeyMFb1K": "NFL_PRO",
  "price_1S1MYMRuMf2a9EBNKr7qBzmO": "NBA_PRO",

  // ALL-ACCESS & DISCORD
  "price_1S1MZTRuMf2a9EBN5AgEsjhA": "ALL_ACCESS_LITE",
  "price_1S1Ma8RuMf2a9EBNIiNqRFDk": "ALL_ACCESS_PRO",   // <- the one you used
  "price_1S1MadRuMf2a9EBNr0zxMsh4": "DISCORD",
};

function bufFromEvent(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "");
}

async function setProfileActiveByUserId({
  userId,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  currentPeriodEnd,
}) {
  if (!userId) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      plan,
      status: "active",
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    })
    .eq("id", userId)
    .single();

  if (error) console.error("Supabase update error:", error);
}

async function setProfileInactiveByStripeCustomerId({ stripeCustomerId }) {
  if (!stripeCustomerId) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      status: "inactive",
      plan: "FREE",
    })
    .eq("stripe_customer_id", stripeCustomerId);

  if (error) console.error("Supabase deactivate error:", error);
}

export const handler = async (event) => {
  const signature = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      bufFromEvent(event),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Signature verify failed:", err?.message);
    return { statusCode: 400, body: `Webhook signature verification failed` };
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed": {
        // Fired right after the user completes Checkout
        const session = stripeEvent.data.object;
        const userId = session.client_reference_id; // we passed this in from the site
        const stripeCustomerId = session.customer;
        const subscriptionId = session.subscription;

        // Pull the subscription to get the price that was purchased
        const sub = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        const firstItem = sub.items?.data?.[0];
        const priceId = firstItem?.price?.id;
        const plan = PLAN_MAP[priceId] || null;

        await setProfileActiveByUserId({
          userId,
          plan,
          stripeCustomerId,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: sub.current_period_end,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Keep status in sync if the user cancels or payment fails later
        const sub = stripeEvent.data.object;
        const stripeCustomerId = sub.customer;

        if (sub.status === "canceled" || sub.status === "unpaid" || sub.status === "past_due") {
          await setProfileInactiveByStripeCustomerId({ stripeCustomerId });
        } else if (sub.status === "active" || sub.status === "trialing") {
          const priceId = sub.items?.data?.[0]?.price?.id;
          const plan = PLAN_MAP[priceId] || null;

          // Find the user by stripe_customer_id and set active + plan
          const { data: profiles, error } = await supabase
            .from("profiles")
            .select("id")
            .eq("stripe_customer_id", stripeCustomerId)
            .limit(1);

          if (!error && profiles && profiles[0]) {
            await setProfileActiveByUserId({
              userId: profiles[0].id,
              plan,
              stripeCustomerId,
              stripeSubscriptionId: sub.id,
              currentPeriodEnd: sub.current_period_end,
            });
          }
        }
        break;
      }

      // Optional: mark inactive if an invoice finally fails
      case "invoice.payment_failed": {
        const invoice = stripeEvent.data.object;
        const stripeCustomerId = invoice.customer;
        await setProfileInactiveByStripeCustomerId({ stripeCustomerId });
        break;
      }

      default:
        // ignore other events
        break;
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Webhook handler error:", err);
    return { statusCode: 500, body: "server error" };
  }
};

// Netlify function path
export const config = { path: "/.netlify/functions/stripe-webhook" };
