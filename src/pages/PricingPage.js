// src/pages/PricingPage.js
import React from "react";
import { supabase } from "../supabaseClient";

/* ----------------------------- Reusable Card ----------------------------- */
function PlanCard({ title, price, period = "/ month", features = [], cta = "Join", onClick }) {
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

      <button
        onClick={onClick}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-white font-semibold hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        {cta}
      </button>
    </div>
  );
}

/* ----------------------- Helper: Start Checkout Session ------------------- */
// Calls your Netlify function to create a Stripe Checkout Session (no trial).
async function startCheckoutSession(priceId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "/login";
    return;
  }

  const res = await fetch("/.netlify/functions/create-checkout-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceId,
      email: user.email,
      userId: user.id,
    }),
  });

  const data = await res.json();
  if (data?.url) {
    window.location.href = data.url;
  } else {
    alert(data?.error || "Unable to start checkout");
  }
}

/* ------------------------------- Page Body ------------------------------- */
export default function PricingPage() {
  // Map plan titles -> LIVE Stripe Price IDs (no trials on Prices).
  const PRICE_PLANS = {
    // LITE
    "MLB LITE Member":    { priceId: "price_1S1MSuRuMf2a9EBN2z4AhmHv" },
    "NASCAR LITE Member": { priceId: "price_1S1MUZRuMf2a9EBNDbrh048G" },
    "NFL LITE Member":    { priceId: "price_1S1MVBRuMf2a9EBN2oFSEa4o" },
    "NBA LITE Member":    { priceId: "price_1S1MVmRuMf2a9EBNGyCBzKXh" },

    // PRO
    "MLB PRO Member":     { priceId: "price_1S1MWORuMf2a9EBN0sYILLhZ" },
    "NASCAR PRO Member":  { priceId: "price_1S1MXJRuMf2a9EBN8gL43fpy" },
    "NFL PRO Member":     { priceId: "price_1S1MXxRuMf2a9EBNKeyMFb1K" },
    "NBA PRO Member":     { priceId: "price_1S1MYMRuMf2a9EBNKr7qBzmO" },

    // ALL-ACCESS & DISCORD
    "All Access LITE":    { priceId: "price_1S1MZTRuMf2a9EBN5AgEsjhA" },
    "All Access PRO":     { priceId: "price_1S1Ma8RuMf2a9EBNIiNqRFDk" },
    "Discord Access":     { priceId: "price_1S1MadRuMf2a9EBNr0zxMsh4" },
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
    {
      title: "MLB PRO Member",
      price: 40,
      features: ["Everything in MLB LITE", "PLUS Optimizer"],
    },
    {
      title: "NASCAR PRO Member",
      price: 40,
      features: ["Everything in NASCAR LITE", "PLUS Optimizer"],
    },
    {
      title: "NFL PRO Member",
      price: 40,
      features: ["Everything in NFL LITE", "PLUS Optimizer"],
    },
    {
      title: "NBA PRO Member",
      price: 40,
      features: ["Everything in NBA LITE", "PLUS Optimizer"],
    },
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
            <PlanCard
              key={`lite-${i}`}
              {...p}
              cta="Start membership"
              onClick={() => {
                const cfg = PRICE_PLANS[p.title];
                startCheckoutSession(cfg.priceId);
              }}
            />
          ))}
        </div>

        {/* divider */}
        <hr className="my-12 border-t-2 border-gray-200" />

        {/* PRO */}
        <h2 className="text-2xl font-bold text-center border-b-2 border-gray-200 pb-3 mb-8">Pro Plans</h2>
        <p className="text-center text-gray-600 mb-8">Everything in Lite plus Optimizer, Ownership, and more.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {proPlans.map((p, i) => (
            <PlanCard
              key={`pro-${i}`}
              {...p}
              cta="Start membership"
              onClick={() => {
                const cfg = PRICE_PLANS[p.title];
                startCheckoutSession(cfg.priceId);
              }}
            />
          ))}
        </div>

        {/* divider */}
        <hr className="my-12 border-t-2 border-gray-200" />

        {/* ALL ACCESS */}
        <h2 className="text-2xl font-bold text-center border-b-2 border-gray-200 pb-3 mb-8">All Access</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          <PlanCard
            {...allAccess}
            cta="Start membership"
            onClick={() => {
              const cfg = PRICE_PLANS["All Access PRO"];
              startCheckoutSession(cfg.priceId);
            }}
          />
          <PlanCard
            {...allAccessLite}
            cta="Start membership"
            onClick={() => {
              const cfg = PRICE_PLANS["All Access LITE"];
              startCheckoutSession(cfg.priceId);
            }}
          />
          <PlanCard
            {...discordOnly}
            cta="Join Discord"
            onClick={() => {
              const cfg = PRICE_PLANS["Discord Access"];
              startCheckoutSession(cfg.priceId);
            }}
          />
        </div>
      </main>
    </div>
  );
}
