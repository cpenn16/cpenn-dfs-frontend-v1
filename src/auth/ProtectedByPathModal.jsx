// src/auth/ProtectedByPathModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { ROUTE_RULES, PROMO_UNLOCKS } from "./gateConfig";
import AccessDeniedModal from "../components/AccessDeniedModal.jsx";
import { PLANS } from "./plans";

/* ---------- helpers ---------- */
const planLabel = (p) => (p ? p.replaceAll("_", " ") : "");

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

/** ALWAYS-PUBLIC routes — no paywall, no auth redirect here. */
const PUBLIC_PATHS = ["/", "/login", "/signup", "/pricing", "/account", "/dashboard", "/discord"];
const isPublicPath = (pathname) => PUBLIC_PATHS.some((p) => pathMatches(p, pathname));
const isPromoOpen = (pathname) =>
  Object.entries(PROMO_UNLOCKS).some(([prefix, open]) => open && pathMatches(prefix, pathname));

export default function ProtectedByPathModal({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // open/public? render normally
  if (isPublicPath(pathname) || isPromoOpen(pathname)) return children;

  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [profile, setProfile] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const rule = useMemo(() => firstMatchingRule(pathname), [pathname]);
  const allowList = rule?.allow ?? [];

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  // Require login for sports routes
  if (!authed) return <Navigate to="/login" replace />;

  // If they have the right plan, show the page
  if (allowed) return children;

  // Otherwise, show upgrade modal
  const sport = sportFromPath(pathname);
  const optimizer = isOptimizerPath(pathname);

  let primaryNeeded; // UPPER_CASE token for display
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

  // turn UPPER_CASE token -> lowercase slug used in /pricing?plan=
  const toSlug = (token) => (token ? token.toLowerCase() : "");
  const buyHref = (token) =>
    `/pricing?plan=${encodeURIComponent(toSlug(token))}&from=${encodeURIComponent(pathname)}`;

  const actions = [
    { label: `Get ${planLabel(primaryNeeded)}`, href: buyHref(primaryNeeded) },
    { label: `Get ${planLabel(secondaryAllAccess)}`, href: buyHref(secondaryAllAccess) },
    { label: "See all plans", href: "/pricing" },
  ];

  const youHave = profile?.plan
    ? `Your current plan: ${planLabel(profile.plan)} (${profile.status || "inactive"})`
    : null;

  return (
    <>
      <AccessDeniedModal
        open={showModal}
        onClose={() => navigate("/", { replace: true })} // ⟵ go HOME on close
        title={
          sport
            ? `This page requires ${optimizer ? `${sport} PRO` : `${sport} LITE or PRO`}`
            : "Upgrade required"
        }
        description={youHave ? `${youHave}. Upgrade to unlock this page.` : `Please upgrade to unlock this page.`}
        actions={actions}
      />
      {/* Render nothing beneath when denied */}
      <div />
    </>
  );
}
