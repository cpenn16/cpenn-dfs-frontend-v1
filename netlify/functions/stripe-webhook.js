import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// Service-role key so we can write to profiles server-side (RLS bypass)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// === YOUR PLAN MAP (from your message) ===
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
  "price_1S1Ma8RuMf2a9EBNIiNqRFDk": "ALL_ACCESS_PRO",
  "price_1S1MadRuMf2a9EBNr0zxMsh4": "DISCORD",
};

function getRawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
}

async function planFromSubscription(sub) {
  const priceId = sub?.items?.data?.[0]?.price?.id;
  return { plan: PLAN_MAP[priceId] || "UNKNOWN", priceId };
}

async function updateProfileByUserId(userId, patch) {
  if (!userId) return;
  await supabase.from("profiles").update(patch).eq("id", userId);
}

async function updateProfileByEmail(email, patch) {
  if (!email) return;
  await supabase.from("profiles").update(patch).eq("email", email);
}

export const handler = async (event) => {
  const sig = event.headers["stripe-signature"];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      // First purchase / payment link completion
      case "checkout.session.completed": {
        const session = stripeEvent.data.object;

        // From your Pricing page you append client_reference_id & prefilled_email
        const userId = session.client_reference_id || null;
        const email  = session.customer_details?.email || session.customer_email || null;

        // Save Stripe customer id so we can match future updates/deletions
        const customerId = typeof session.customer === "string" ? session.customer : null;

        // Pull sub → price → plan + status
        const subId = session.subscription;
        const sub   = subId ? await stripe.subscriptions.retrieve(subId) : null;
        const { plan } = await planFromSubscription(sub);

        const patch = {
          plan:   plan === "UNKNOWN" ? "FREE" : plan,
          status: sub?.status || "active", // 'active' | 'trialing' | 'past_due' ...
          ...(customerId ? { stripe_customer_id: customerId } : {}),
        };

        if (userId)       await updateProfileByUserId(userId, patch);
        else if (email)   await updateProfileByEmail(email, patch);
        break;
      }

      // Renewals, upgrades/downgrades, payment status changes
      case "customer.subscription.updated": {
        const sub = stripeEvent.data.object;
        const { plan } = await planFromSubscription(sub);
        const status = sub.status;

        // Find user by stored Stripe customer id
        const customerId = sub.customer;
        const { data: rows } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (rows && rows[0]?.id) {
          await updateProfileByUserId(rows[0].id, {
            plan: plan === "UNKNOWN" ? undefined : plan,
            status,
          });
        }
        break;
      }

      // Cancellations (at period end → event fires when it actually cancels)
      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object;
        const customerId = sub.customer;

        const { data: rows } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (rows && rows[0]?.id) {
          await updateProfileByUserId(rows[0].id, { status: "canceled" });
        }
        break;
      }

      default:
        // ignore everything else
        break;
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Webhook handler error:", err);
    return { statusCode: 500, body: "server error" };
  }
};

export const config = { path: "/.netlify/functions/stripe-webhook" };
