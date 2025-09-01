// netlify/functions/paypal-webhook.js
// CommonJS for Netlify Functions
const { createClient } = require("@supabase/supabase-js");

// --- Supabase admin client (Service Role key) ---
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// --- Map PayPal plan_id -> your grants (add the rest as needed) ---
const GRANTS = {
  // LITE
  "P-5CH30718EJ5817631NC23TSI": { sport: "nascar", tier: "lite", profileFlag: "nascar_lite" },
  "P-0DK27985LU908842VNC23VJQ": { sport: "mlb", tier: "lite", profileFlag: "mlb_lite" },
  "P-9A079862R35074028NC23UOA": { sport: "nfl", tier: "lite", profileFlag: "nfl_lite" },
  "P-8T5580076P393200FNC23WBI": { sport: "nba", tier: "lite", profileFlag: "nba_lite" },
  // PRO
  "P-8G568744214719119NC23QEA": { sport: "nascar", tier: "pro", profileFlag: "nascar_pro" },
  "P-83Y13089DD870461TNC23R3I": { sport: "mlb", tier: "pro", profileFlag: "mlb_pro" },
  "P-7EV8463063412251LNC23Q6Y": { sport: "nfl", tier: "pro", profileFlag: "nfl_pro" },
  "P-55W83452GH8917325NC23SVQ": { sport: "nba", tier: "pro", profileFlag: "nba_pro" },
  // Bundles
  "P-01112034F4978121RNC23PBY": { sport: "all", tier: "lite", profileFlag: "all_access_lite" },
  "P-3NA07489RA706953DNC23NOI": { sport: "all", tier: "pro", profileFlag: "all_access_pro" },
  // Discord
  "P-96N94697095892935NC23XXI": { sport: "discord", tier: "lite", profileFlag: "discord_only" },
};

// --- helper: log key fields while testing ---
function logEvent(body) {
  const r = body?.resource || {};
  console.log("[paypal]", body?.event_type, {
    planId: r.plan_id,
    customId: r.custom_id,
    email: r?.subscriber?.email_address,
    nextBill: r?.billing_info?.next_billing_time,
  });
}

// --- helper: verify PayPal signature ---
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

// --- helper: fallback user lookup by email when custom_id missing ---
async function findUserIdByEmail(email) {
  if (!email) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .ilike("email", email.toLowerCase())
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[webhook] profiles lookup error:", error);
    return null;
  }
  return data?.id || null;
}

// --- helper: grant access (profile flag + memberships row) ---
async function grantAccess(userId, planId, nextBillingTime) {
  const grant = GRANTS[planId];
  if (!grant) {
    console.log("[webhook] unknown planId:", planId);
    return;
  }

  // A) quick: flip a boolean on profiles
  if (grant.profileFlag) {
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, [grant.profileFlag]: true })
      .eq("id", userId);
    if (profErr) console.error("[webhook] profiles upsert error:", profErr);
  }

  // B) normalized memberships record (ignore if table doesn't exist)
  const { error: memErr } = await supabaseAdmin
    .from("memberships")
    .upsert({
      user_id: userId,
      sport: grant.sport,
      tier: grant.tier,
      plan_id: planId,
      status: "active",
      current_period_end: nextBillingTime ? new Date(nextBillingTime).toISOString() : null,
    });
  if (memErr) console.error("[webhook] memberships upsert error:", memErr);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = JSON.parse(event.body || "{}");

    // 1) Verify signature
    const ok = await verifySignature(event, body);
    if (!ok) {
      console.warn("[webhook] signature verify FAILED");
      return { statusCode: 400, body: "Bad signature" };
    }

    logEvent(body);

    const type = body.event_type;
    const r = body.resource || {};
    const planId = r.plan_id;
    const nextBillingTime = r?.billing_info?.next_billing_time || null;

    // Only act on relevant events
    if (
      type !== "BILLING.SUBSCRIPTION.ACTIVATED" &&
      type !== "BILLING.SUBSCRIPTION.UPDATED" &&
      type !== "PAYMENT.SALE.COMPLETED"
    ) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // 2) Find the user: prefer custom_id from your PayPal button; else fallback by email
    let userId = r.custom_id || null;
    if (!userId) {
      userId = await findUserIdByEmail(r?.subscriber?.email_address || null);
    }
    if (!userId) {
      console.warn("[webhook] no userId (custom_id/email) — cannot assign access");
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // 3) Grant access based on plan id (e.g., NASCAR LITE)
    await grantAccess(userId, planId, nextBillingTime);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("[webhook] error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
