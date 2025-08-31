// src/auth/ProtectedByPathModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { ROUTE_RULES } from "./gateConfig";
import AccessDeniedModal from "../components/AccessDeniedModal.jsx";
import { PLANS } from "./plans";

/** OPTIONAL: if you have direct Stripe links per plan, put them here.
 * Fallback is /pricing with a query to highlight.
 */
const BUY_LINKS = {
  DISCORD_ONLY: "https://buy.stripe.com/14AfZj64p0TbgZv5gkaAw02",

  ALL_ACCESS_LITE: "https://buy.stripe.com/fZucN72Sd6dv4cJcIMaAw01",
  ALL_ACCESS_PRO: "https://buy.stripe.com/6oU14peAV8lD24B38caAw00",

  NASCAR_PRO: "https://buy.stripe.com/dRm00l50lbxP38FcIMaAw05",
  NFL_PRO: "https://buy.stripe.com/aFa8wRcsN8lDdNj104aAw04",
  NBA_PRO: "https://buy.stripe.com/14A8wR0K56dvcJf9wAaAw03",
  MLB_PRO: "https://buy.stripe.com/14A8wR0K56dvcJf9wAaAw03", // update if MLB PRO has different link

  NASCAR_LITE: "https://buy.stripe.com/1S1MUZRuMf2a9EBNDbrh048G",
  NFL_LITE: "https://buy.stripe.com/1S1MVBRuMf2a9EBN2oFSEa4o",
  NBA_LITE: "https://buy.stripe.com/1S1MVmRuMf2a9EBNGyCBzKXh",
  MLB_LITE: "https://buy.stripe.com/1S1MSuRuMf2a9EBN2z4AhmHv",
};

function sportFromPath(pathname) {
  if (pathname.startsWith("/nfl")) return "NFL";
  if (pathname.startsWith("/nascar")) return "NASCAR";
  if (pathname.startsWith("/mlb")) return "MLB";
  if (pathname.startsWith("/nba")) return "NBA";
  return null;
}

function isOptimizerPath(pathname) {
  return pathname.includes("/optimizer");
}

function firstMatchingRule(pathname) {
  return ROUTE_RULES.find(r => pathname.startsWith(r.prefix)) || null;
}

function planLabel(plan) {
  return plan?.replaceAll("_", " "); // e.g. NFL_PRO -> NFL PRO
}

function buyHref(plan) {
  return BUY_LINKS[plan] || `/pricing?highlight=${encodeURIComponent(plan)}`;
}

export default function ProtectedByPathModal({ children }) {
  const { pathname } = useLocation();
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

      const active = data?.status === "active" || data?.status === "trialing";
      const inPlan = allowList.length === 0 || allowList.includes(data?.plan);

      const ok = Boolean(active && inPlan);
      setAllowed(ok);
      setLoading(false);

      if (!ok) setShowModal(true);
    })();
  }, [allowList, pathname]);

  if (loading) return null;
  if (!authed) return <Navigate to="/login" replace />;

  if (allowed) return children;

  // Build the recommendation for this path
  const sport = sportFromPath(pathname);
  const optimizer = isOptimizerPath(pathname);

  // What they need (minimum plan to unlock this exact page)
  let primaryNeeded;        // sport LITE or PRO depending on page
  let secondaryAllAccess;   // all-access lite or pro

  if (sport) {
    if (optimizer) {
      // Optimizers are PRO only
      primaryNeeded = `${sport}_PRO`;
      secondaryAllAccess = "ALL_ACCESS_PRO";
    } else {
      // Non-optimizer pages accept LITE or PRO
      primaryNeeded = `${sport}_LITE`;
      secondaryAllAccess = "ALL_ACCESS_LITE";
    }
  } else {
    // Fallback: recommend all-access
    primaryNeeded = "ALL_ACCESS_LITE";
    secondaryAllAccess = "ALL_ACCESS_PRO";
  }

  const actions = [
    { label: `Get ${planLabel(primaryNeeded)}`, href: buyHref(primaryNeeded) },
    { label: `Get ${planLabel(secondaryAllAccess)}`, href: buyHref(secondaryAllAccess) },
    { label: "See all plans", href: "/pricing" },
  ];

  const youHave =
    profile?.plan ? `Your current plan: ${planLabel(profile.plan)} (${profile.status || "inactive"})` : null;

  return (
    <>
      {/* Show modal overlay; keep them on the page they tried */}
      <AccessDeniedModal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={sport ? `This page requires ${optimizer ? `${sport} PRO` : `${sport} LITE or PRO`}` : "Upgrade required"}
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
