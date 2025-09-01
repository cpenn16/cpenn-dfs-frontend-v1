// src/pages/PricingPage.js
import React, { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

/* ------------------------------------------------------------------
   PayPal SDK loader (robust)
   - Fails if client-id missing
   - Ensures only ONE script is on the page
   - Replaces a previously-loaded script with the wrong client-id
------------------------------------------------------------------ */
const PAYPAL_SCRIPT_ID = "paypal-sdk";

function loadPayPalSdk(clientId) {
  return new Promise((resolve, reject) => {
    if (!clientId) return reject(new Error("Missing REACT_APP_PAYPAL_LIVE_CLIENT_ID"));

    const existing = document.getElementById(PAYPAL_SCRIPT_ID);
    if (existing) {
      // If the existing script has a different client-id, remove it and reset
      if (!existing.src.includes(`client-id=${encodeURIComponent(clientId)}`)) {
        existing.remove();
        // eslint-disable-next-line no-undef
        if (window.paypal) delete window.paypal;
      }
    }

    // If paypal is already present with the right id, use it
    // eslint-disable-next-line no-undef
    if (window.paypal) return resolve(window.paypal);

    const s = document.createElement("script");
    s.id = PAYPAL_SCRIPT_ID;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      clientId
    )}&components=buttons&intent=subscription&vault=true`;
    s.async = true;
    s.onload = () => resolve(window.paypal);
    s.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(s);
  });
}

/* ------------------------------------------------------------------
   Single PayPal subscribe button
   - Clears container before render
   - Closes previous instance on cleanup
   - Works around React 18 StrictMode double-invoke
------------------------------------------------------------------ */
function PayPalSubscribeButton({ planId, onApproved }) {
  const hostRef = useRef(null);
  const buttonsRef = useRef(null); // keep instance to close on cleanup

  useEffect(() => {
    let cancelled = false;

    async function renderBtn() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const paypal = await loadPayPalSdk(process.env.REACT_APP_PAYPAL_LIVE_CLIENT_ID);
        if (cancelled || !hostRef.current) return;

        // Ensure a clean container (prevents duplicate stacks)
        hostRef.current.innerHTML = "";

        const instance = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "subscribe" },
          createSubscription: (_data, actions) =>
            actions.subscription.create({
              plan_id: planId,
              custom_id: user?.id || undefined, // your webhook maps this back to Supabase
              application_context: { user_action: "SUBSCRIBE_NOW" },
            }),
          onApprove: async (data) => {
            onApproved?.(data);
          },
          onError: (err) => {
            console.error("[PayPal] onError:", err);
            alert("Payment error. Please try again.");
          },
        });

        buttonsRef.current = instance;

        // Render into the host element
        await instance.render(hostRef.current);
      } catch (err) {
        console.error("[PayPal] SDK load/render failed:", err);
      }
    }

    renderBtn();

    // Cleanup: close and clear so StrictMode remount doesn't duplicate
    return () => {
      cancelled = true;
      try {
        buttonsRef.current?.close?.();
      } catch {}
      if (hostRef.current) hostRef.current.innerHTML = "";
      buttonsRef.current = null;
    };
  }, [planId, onApproved]);

  return <div ref={hostRef} />;
}

/* ----------------------------- UI card ----------------------------- */
function PlanCard({ title, price, period = "/ month", features = [], children }) {
  return (
    <div className="rounded-2xl shadow-lg ring-1 ring-black/5 bg-white p-6 md:p-8 flex flex-col justify-between">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight text-gray-900">{title}</h3>

        <div className="mt-3 flex items-end gap-2">
          <span className="text-2xl font-extrabold text-gray-900">${price}</span>
          <span className="text-sm text-gray-500">{period}</span>
        </div>

        <ul className="mt-5 space-y-2 text-sm leading-6 text-gray-700">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">{children}</div>
    </div>
  );
}

/* --------------------------- Pricing page --------------------------- */
export default function PricingPage() {
  // 🔒 Your LIVE PayPal plan IDs
  const PLAN_IDS = {
    "Discord Access": "P-96N94697095892935NC23XXI",

    "NBA LITE Member": "P-8T5580076P393200FNC23WBI",
    "MLB LITE Member": "P-0DK27985LU908842VNC23VJQ",
    "NFL LITE Member": "P-9A079862R35074028NC23UOA",
    "NASCAR LITE Member": "P-5CH30718EJ5817631NC23TSI",

    "NBA PRO Member": "P-55W83452GH8917325NC23SVQ",
    "MLB PRO Member": "P-83Y13089DD870461TNC23R3I",
    "NFL PRO Member": "P-7EV8463063412251LNC23Q6Y",
    "NASCAR PRO Member": "P-8G568744214719119NC23QEA",

    "All Access LITE": "P-01112034F4978121RNC23PBY",
    "All Access PRO": "P-3NA07489RA706953DNC23NOI",
  };

  const handleApproved = () => {
    // After approval, your webhook will flip access. Send them to Account.
    window.location.href = "/account";
  };

  /* ---- LITE ---- */
  const litePlans = [
    {
      title: "MLB LITE Member",
      price: 30,
      features: [
        "Projections & Ownership",
        "Cheat Sheets",
        "Data Sheets",
        "Top Stacks",
        "Rankings",
        "Floor/Ceiling Projecitons",
        "Discord",
        "Does not include Optimizer (in PRO)",
      ],
    },
    {
      title: "NASCAR LITE Member",
      price: 30,
      features: [
        "Projections & Ownership",
        "Driver Simulations",
        "Betting Models",
        "Data Sheets",
        "Floor/Ceiling Projections",
        "Weekly Breakdown Article",
        "Breakdown Articles",
        "Optimal Rates",
        "Xfinity & Trucks Supported",
        "Does not include Optimizer (in PRO)",
      ],
    },
    {
      title: "NFL LITE Member",
      price: 30,
      features: [
        "Projections & Ownership",
        "Detailed Player Projected Stats",
        "Optimal Rates",
        "Cheat Sheets",
        "Data Sheets",
        "Stacks",
        "Discord",
        "Does not include Optimizer (in PRO)",
      ],
    },
    {
      title: "NBA LITE Member",
      price: 30,
      features: [
        "Projections & Ownership",
        "Cheat Sheets",
        "Discord",
        "Does not include Optimizer (in PRO)",
      ],
    },
  ];

  /* ---- PRO ---- */
  const proPlans = [
    { title: "MLB PRO Member", price: 40, features: ["Everything in MLB LITE", "PLUS Optimizer"] },
    { title: "NASCAR PRO Member", price: 40, features: ["Everything in NASCAR LITE", "PLUS Optimizer"] },
    { title: "NFL PRO Member", price: 40, features: ["Everything in NFL LITE", "PLUS Optimizer"] },
    { title: "NBA PRO Member", price: 40, features: ["Everything in NBA LITE", "PLUS Optimizer"] },
  ];

  /* ---- ALL ACCESS + DISCORD ---- */
  const allAccess = {
    title: "All Access PRO",
    price: 50,
    features: ["Everything in LITE & PRO tiers", "All sports access", "All Discord channels", "Optimizer included"],
  };

  const allAccessLite = {
    title: "All Access LITE",
    price: 40,
    features: ["Everything in all LITE tiers", "Does not include Optimizers (in PRO)"],
  };

  const discordOnly = {
    title: "Discord Access",
    price: 10,
    features: ["Private Discord channels", "Strategy & community support", "DFS tips and discussion"],
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* hero */}
      <section className="bg-gradient-to-r from-blue-900 to-blue-600 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Join Cpenn DFS Today</h1>
          <p className="mt-3 text-blue-100">Choose a membership to unlock projections, tools, and community.</p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* LITE */}
        <h2 className="text-2xl font-bold text-center border-b-2 border-gray-200 pb-3 mb-8">Lite Plans</h2>
        <p className="text-center text-gray-600 mb-8">Sport-specific access without the Optimizer.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {litePlans.map((p, i) => (
            <PlanCard key={`lite-${i}`} {...p}>
              <PayPalSubscribeButton planId={PLAN_IDS[p.title]} onApproved={handleApproved} />
            </PlanCard>
          ))}
        </div>

        {/* divider */}
        <hr className="my-12 border-t-2 border-gray-200" />

        {/* PRO */}
        <h2 className="text-2xl font-bold text-center border-b-2 border-gray-200 pb-3 mb-8">Pro Plans</h2>
        <p className="text-center text-gray-600 mb-8">Everything in Lite plus Optimizer, Ownership, and more.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {proPlans.map((p, i) => (
            <PlanCard key={`pro-${i}`} {...p}>
              <PayPalSubscribeButton planId={PLAN_IDS[p.title]} onApproved={handleApproved} />
            </PlanCard>
          ))}
        </div>

        {/* divider */}
        <hr className="my-12 border-t-2 border-gray-200" />

        {/* ALL ACCESS */}
        <h2 className="text-2xl font-bold text-center border-b-2 border-gray-200 pb-3 mb-8">All Access</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          <PlanCard {...allAccess}>
            <PayPalSubscribeButton planId={PLAN_IDS["All Access PRO"]} onApproved={handleApproved} />
          </PlanCard>

          <PlanCard {...allAccessLite}>
            <PayPalSubscribeButton planId={PLAN_IDS["All Access LITE"]} onApproved={handleApproved} />
          </PlanCard>

          <PlanCard {...discordOnly}>
            <PayPalSubscribeButton planId={PLAN_IDS["Discord Access"]} onApproved={handleApproved} />
          </PlanCard>
        </div>
      </main>
    </div>
  );
}
