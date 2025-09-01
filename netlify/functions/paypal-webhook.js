// netlify/functions/paypal-webhook.js
const { createClient } = require("@supabase/supabase-js");

// --- Supabase admin (service role) ---
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// PayPal plan_id -> what to store in profiles.plan
const PLAN_MAP = {
  // LITE
  "P-5CH30718EJ5817631NC23TSI": "nascar_lite",
  "P-0DK27985LU908842VNC23VJQ": "mlb_lite",
  "P-9A079862R35074028NC23UOA": "nfl_lite",
  "P-8T5580076P393200FNC23WBI": "nba_lite",
  // PRO
  "P-8G568744214719119NC23QEA": "nascar_pro",
  "P-83Y13089DD870461TNC23R3I": "mlb_pro",
  "P-7EV8463063412251LNC23Q6Y": "nfl_pro",
  "P-55W83452GH8917325NC23SVQ": "nba_pro",
  // Bundles
  "P-01112034F4978121RNC23PBY": "all_access_lite",
  "P-3NA07489RA706953DNC23NOI": "all_access_pro",
  // Discord
  "P-96N94697095892935NC23XXI": "discord_only",
};

// ----- helpers -----
function logEvent(body) {
  const r = body?.resource || {};
  console.log("[paypal]", body?.event_type, {
    planId: r.plan_id,
    customId: r.custom_id,
    email: r?.subscriber?.email_address,
    nextBill: r?.billing_info?.next_billing_time,
  });
}

async function verifySignature(req, body) {
  const auth = Buffer.from(
    `${process.env.PAYPAL_LIVE_CLIENT_ID}:${process.env.PAYPAL_LIVE_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch("https://api-m.paypal.com/v1/notifications/verify-webhook-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      transmission_id: req.headers["paypal-transmission-id"],
      transmission_time: req.headers["paypal-transmission-time"],
      cert_url: req.headers["paypal-cert-url"],
      auth_algo: req.headers["paypal-auth-algo"],
      transmission_sig: req.headers["paypal-transmission-sig"],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: body,
    }),
  });

  const json = await res.json();
  return json?.verification_status === "SUCCESS";
}

// Prefer custom_id; fallback to Supabase user by email
async function resolveUserId(resource) {
  if (resource?.custom_id) return resource.custom_id;

  const email = resource?.subscriber?.email_address;
  if (!email) return null;

  const { data, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);
  if (error) {
    console.error("[webhook] getUserByEmail error:", error);
    return null;
  }
  return data?.user?.id ?? null;
}

async function setPlan(userId, planValue) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ plan: planValue })
    .eq("id", userId);

  if (error) console.error("[webhook] profiles.plan update error:", error);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");

    // 1) Verify PayPal signature
    const ok = await verifySignature(event, body);
    if (!ok) {
      console.warn("[webhook] signature verify FAILED");
      return { statusCode: 400, body: "Bad signature" };
    }

    logEvent(body);

    const type = body.event_type;
    const r = body.resource || {};
    const planId = r.plan_id;
    const mappedPlan = PLAN_MAP[planId];

    // 2) We care about these subscription lifecycle events
    const ACTIVATION_EVENTS = new Set([
      "BILLING.SUBSCRIPTION.ACTIVATED",
      "BILLING.SUBSCRIPTION.UPDATED",
      "PAYMENT.SALE.COMPLETED",
    ]);
    const DEACTIVATION_EVENTS = new Set([
      "BILLING.SUBSCRIPTION.CANCELLED",
      "BILLING.SUBSCRIPTION.SUSPENDED",
      "BILLING.SUBSCRIPTION.EXPIRED",
    ]);

    if (!ACTIVATION_EVENTS.has(type) && !DEACTIVATION_EVENTS.has(type)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // 3) Resolve the user id
    const userId = await resolveUserId(r);
    if (!userId) {
      console.warn("[webhook] no userId (custom_id/email) — cannot assign access");
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // 4) Update profiles.plan
    if (ACTIVATION_EVENTS.has(type) && mappedPlan) {
      await setPlan(userId, mappedPlan);
    } else if (DEACTIVATION_EVENTS.has(type)) {
      await setPlan(userId, "free");
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[webhook] error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
