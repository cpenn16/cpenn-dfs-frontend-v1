// src/auth/Protected.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

/**
 * Plan-gated guard.
 * - allow: array of plan strings that can access the page (from gateConfig)
 * - status allowed: 'active' or 'trialing'
 */
export default function Protected({ allow = [], children }) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan,status")
        .eq("id", user.id)
        .single();

      const active = profile?.status === "active" || profile?.status === "trialing";
      const inPlan = allow.length === 0 || allow.includes(profile?.plan);

      setOk(Boolean(active && inPlan));
      setLoading(false);
    })();
  }, [allow]);

  if (loading) return null;
  if (!authed) return <Navigate to="/login" replace />;
  if (!ok)     return <Navigate to="/pricing" replace />;

  return children;
}
