// src/auth/ProtectedByPath.jsx
import { useLocation } from "react-router-dom";
import Protected from "./Protected";
import { ROUTE_RULES } from "./gateConfig";

/** Picks the first matching rule by URL prefix and applies Protected with that allow list. */
export default function ProtectedByPath({ children }) {
  const { pathname } = useLocation();
  const rule = ROUTE_RULES.find(r => pathname.startsWith(r.prefix));
  const allow = rule?.allow ?? [];
  return <Protected allow={allow}>{children}</Protected>;
}
