// netlify/functions/paypal-webhook.js
// Node 18 on Netlify has global fetch

const { createClient } = require("@supabase/supabase-js");

const PLAN_ID_TO_NAME = {
  // ---- Your LIVE PayPal plans (from your message) ----
  "P-96N94697095892935NC23XXI": "Discord Access",

  "P-8T5580076P393200FNC23WBI": "NBA LITE Member",
  "P-0DK27985LU908842VNC23VJQ": "MLB LITE Member",
  "P-9A079862R35074028NC23UOA": "NFL LITE Member",
  "P-5CH30718EJ5817631NC23TSI": "NASCAR LITE Member",

  "P-55W83452GH8917325NC23SVQ": "NBA PRO Member",
  "P-83Y13089DD870461TNC23R3I": "MLB PRO Member",
  "P-7EV8463063412251LNC23Q6Y": "NFL PRO Member",
  "P-8G568744214719119NC23QEA": "NASCAR PRO Member",

  "P-01112034F4978121RNC23PBY": "All Access LITE",
  "P-3NA07489RA706953DNC23NOI": "All Access PRO",
};

const FREE_PLAN = "FREE";

// env
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PAYPAL_LIVE_CLIENT_ID,
  PAYPAL_LIVE_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID, // from PayPal > Webhooks
} = process.env;

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// PayPal API helpers (LIVE)
const PAYPAL_API = "https://api-m.paypal.com";

async function getPayPalAccessToken() {
  const creds = Buffer.from(
    `${PAYPAL_LIVE_CLIENT_ID}:${PAYPAL_LIVE_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PayPal token error: ${res.status} ${t}`);
  }
  return res.json();
}

async function verifyWebhookSignature(headers, bodyJson) {
  const { access_token } = await getPayPalAccessToken();

  const payload = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: bodyJson,
  };

  const res = await fetch(
    `${PAYPAL_API}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();
  if (data.verification_status !== "SUCCESS") {
    throw new Error(
      `Webhook signature verification failed: ${JSON.stringify(data)}`
    );
  }
  return true;
}

// Update your profiles table
async function activateSubscription({ userId, planId, subscriptionId }) {
  const planName = PLAN_ID_TO_NAME[planId] || null;
  if (!planName) {
    console.warn("Unknown planId:", planId);
    return;
  }

  const sb = supabaseAdmin();
  // Assumes a 'profiles' table keyed by 'id' (user.id) with fields:
  // plan (text), status (text), paypal_subscription_id (text)
  await sb
    .from("profiles")
    .update({
      plan: planName,
      status: "active",
      paypal_subscription_id: subscriptionId,
    })
    .eq("id", userId);
}

async function deactivateSubscription({ userId }) {
  const sb = supabaseAdmin();
  await sb
    .from("profiles")
    .update({
      plan: FREE_PLAN,
      status: "inactive",
      paypal_subscription_id: null,
    })
    .eq("id", userId);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase env not set");
    }
    if (!PAYPAL_LIVE_CLIENT_ID || !PAYPAL_LIVE_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
      throw new Error("PayPal webhook env not set");
    }

    // Parse JSON once (keep the string for reference if needed)
    const bodyJson = JSON.parse(event.body || "{}");

    // Verify signature using PayPal API
    const headers = {
      "paypal-auth-algo": event.headers["paypal-auth-algo"],
      "paypal-cert-url": event.headers["paypal-cert-url"],
      "paypal-transmission-id": event.headers["paypal-transmission-id"],
      "paypal-transmission-sig": event.headers["paypal-transmission-sig"],
      "paypal-transmission-time": event.headers["paypal-transmission-time"],
    };

    await verifyWebhookSignature(headers, bodyJson);

    const { event_type: type, resource } = bodyJson || {};
    // resource fields depend on type; for subscriptions:
    //   resource.id (subscriptionId), resource.plan_id, resource.custom_id, resource.status
    // We put the Supabase user.id into custom_id during createSubscription.

    const subscriptionId = resource?.id;
    const planId = resource?.plan_id;
    const userId = resource?.custom_id || null;

    // If custom_id missing, you *can* try fallback via email:
    // const email = resource?.subscriber?.email_address;

    switch (type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.UPDATED":
        if (userId && planId) {
          await activateSubscription({ userId, planId, subscriptionId });
        }
        break;

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
        if (userId) {
          await deactivateSubscription({ userId });
        }
        break;

      // Optional: handle payment events if you want to log them
      // case "PAYMENT.SALE.COMPLETED":
      // case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
      //   break;

      default:
        // Ignore other events
        break;
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("paypal-webhook error:", err);
    // Respond 200 to avoid repeated retries if *your* code throws,
    // but 400 will make PayPal retry. While debugging, 400 is OK.
    return { statusCode: 400, body: String(err.message || err) };
  }
};
