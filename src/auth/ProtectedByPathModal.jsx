// src/auth/ProtectedByPathModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { ROUTE_RULES, PROMO_UNLOCKS } from "./gateConfig";
import AccessDeniedModal from "../components/AccessDeniedModal.jsx";
import { PLANS } from "./plans";

/** If you have direct Stripe links per plan, put them here (optional). */
const BUY_LINKS = {
  DISCORD_ONLY: "https://buy.stripe.com/14AfZj64p0TbgZv5gkaAw02",

  ALL_ACCESS_LITE: "https://buy.stripe.com/fZucN72Sd6dv4cJcIMaAw01",
  ALL_ACCESS_PRO:  "https://buy.stripe.com/6oU14peAV8lD24B38caAw00",

  NASCAR_PRO: "https://buy.stripe.com/dRm00l50lbxP38FcIMaAw05",
  NFL_PRO:    "https://buy.stripe.com/aFa8wRcsN8lDdNj104aAw04",
  NBA_PRO:    "https://buy.stripe.com/14A8wR0K56dvcJf9wAaAw03",
  MLB_PRO:    "https://buy.stripe.com/14A8wR0K56dvcJf9wAaAw03",

  NASCAR_LITE: "https://buy.stripe.com/1S1MUZRuMf2a9EBNDbrh048G",
  NFL_LITE:    "https://buy.stripe.com/1S1MVBRuMf2a9EBN2oFSEa4o",
  NBA_LITE:    "https://buy.stripe.com/1S1MVmRuMf2a9EBNGyCBzKXh",
  MLB_LITE:    "https://buy.stripe.com/1S1MSuRuMf2a9EBN2z4AhmHv",
};

/* ---------- helpers ---------- */
const planLabel = (p) => p?.replaceAll("_", " ");

const buyHref = (plan) =>
  BUY_LINKS[plan] || `/pricing?highlight=${encodeURIComponent(plan)}`;

// Basic sport detection for nicer modal copy
function sportFromPath(pathname) {
  if (pathname.startsWith("/nfl")) return "NFL";
  if (pathname.startsWith("/nascar")) return "NASCAR";
  if (pathname.startsWith("/mlb")) return "MLB";
  if (pathname.startsWith("/nba")) return "NBA";
  return null;
}
const isOptimizerPath = (p) => p.includes("/optimizer");

function firstMatchingRule(pathname) {
  return ROUTE_RULES.find((r) => pathname.startsWith(r.prefix)) || null;
}

// prefix match helper: "/" matches only exact "/", all others match prefix
function pathMatches(prefix, pathname) {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * ALWAYS-PUBLIC routes — no paywall, no auth redirect here.
 * (Your page component can still check auth if it needs to.)
 */
const PUBLIC_PATHS = [
  "/",           // home
  "/login",
  "/signup",
  "/pricing",
  "/account",
  "/dashboard",
  "/discord",
];

// true if the current path is in PUBLIC_PATHS
function isPublicPath(pathname) {
  return PUBLIC_PATHS.some((p) => pathMatches(p, pathname));
}

// true if a promo flag is turned on for a matching sports prefix
function isPromoOpen(pathname) {
  return Object.entries(PROMO_UNLOCKS).some(([prefix, open]) => {
    if (!open) return false;
    return pathMatches(prefix, pathname);
  });
}

export default function ProtectedByPathModal({ children }) {
  const { pathname } = useLocation();

  // 1) Non-sports stuff is always open, no gating or login redirect.
  // 2) Promo overrides also make a sports path temporarily public.
  if (isPublicPath(pathname) || isPromoOpen(pathname)) {
    return children;
  }

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const rule = useMemo(() => firstMatchingRule(pathname), [pathname]);
  const allowList = rule?.allow ?? [];

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      const { data } = await supabase
        .from("profiles")
        .select("plan,status")
        .eq("id", user.id)
        .single();

      setProfile(data || null);

      const active  = data?.status === "active" || data?.status === "trialing";
      const inPlan  = allowList.length === 0 || allowList.includes(data?.plan);
      const ok = Boolean(active && inPlan);

      setAllowed(ok);
      setLoading(false);

      if (!ok) setShowModal(true);
    })();
  }, [allowList, pathname]);

  // For sports routes: require login
  if (loading) return null;
  if (!authed) return <Navigate to="/login" replace />;

  // If they have the right plan, show the page
  if (allowed) return children;

  // Otherwise, show upgrade modal
  const sport = sportFromPath(pathname);
  const optimizer = isOptimizerPath(pathname);

  let primaryNeeded;
  let secondaryAllAccess;

  if (sport) {
    if (optimizer) {
      primaryNeeded = `${sport}_PRO`;
      secondaryAllAccess = "ALL_ACCESS_PRO";
    } else {
      primaryNeeded = `${sport}_LITE`;
      secondaryAllAccess = "ALL_ACCESS_LITE";
    }
  } else {
    primaryNeeded = "ALL_ACCESS_LITE";
    secondaryAllAccess = "ALL_ACCESS_PRO";
  }

  const actions = [
    { label: `Get ${planLabel(primaryNeeded)}`, href: buyHref(primaryNeeded) },
    { label: `Get ${planLabel(secondaryAllAccess)}`, href: buyHref(secondaryAllAccess) },
    { label: "See all plans", href: "/pricing" },
  ];

  const youHave =
    profile?.plan
      ? `Your current plan: ${planLabel(profile.plan)} (${profile.status || "inactive"})`
      : null;

  return (
    <>
      <AccessDeniedModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={
          sport
            ? `This page requires ${optimizer ? `${sport} PRO` : `${sport} LITE or PRO`}`
            : "Upgrade required"
        }
        description={
          youHave
            ? `${youHave}. Upgrade to unlock this page.`
            : `Please upgrade to unlock this page.`
        }
        actions={actions}
      />
      {/* Render nothing underneath when denied */}
      <div />
    </>
  );
}
