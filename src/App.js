// src/App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";

import NavBar from "./components/NavBar";

// Supabase + Auth bits
import { supabase } from "./supabaseClient";
import AuthOnly from "./auth/AuthOnly";
import ProtectedByPathModal from "./auth/ProtectedByPathModal";

// Auth pages
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard"; // kept in case you still use it somewhere

// Account page (profile/plan/status)
import AccountPage from "./pages/AccountPage";

// Top-level
import HomePage from "./pages/HomePage";
import PricingPage from "./pages/PricingPage";

/* ---------------- NASCAR — CUP ---------------- */
import CupProjections from "./pages/nascar/CupProjections";
import CupOdds from "./pages/nascar/CupOdds";
import CupGfs from "./pages/nascar/CupGfs";
import CupPractice from "./pages/nascar/CupPractice";
import CupCheatSheets from "./pages/nascar/CupCheatSheets";
import CupOptimizer from "./pages/nascar/CupOptimizer";
import CupData from "./pages/nascar/CupData";

/* ---------------- NASCAR — XFINITY ---------------- */
import XfProjections from "./pages/nascar/XfProjections";
import XfOdds from "./pages/nascar/XfOdds";
import XfGfs from "./pages/nascar/XfGfs";
import XfPractice from "./pages/nascar/XfPractice";
import XfCheatSheets from "./pages/nascar/XfCheatSheets";
import XfOptimizer from "./pages/nascar/XfOptimizer";
import XfData from "./pages/nascar/XfData";

/* ---------------- NASCAR — TRUCKS ---------------- */
import TrucksProjections from "./pages/nascar/TrucksProjections";
import TrucksOdds from "./pages/nascar/TrucksOdds";
import TrucksGfs from "./pages/nascar/TrucksGfs";
import TrucksPractice from "./pages/nascar/TrucksPractice";
import TrucksCheatSheets from "./pages/nascar/TrucksCheatSheets";
import TrucksOptimizer from "./pages/nascar/TrucksOptimizer";
import TrucksData from "./pages/nascar/TrucksData";

/* ---------------- NFL (CLASSIC) ---------------- */
import NflProjections from "./pages/nfl/NflProjections";
import NflStacks from "./pages/nfl/NflStacks";
import NflCheatSheets from "./pages/nfl/NflCheatSheets";
import NFLOptimizer from "./pages/nfl/NflOptimizer";

// position projections
import NflQBProjections from "./pages/nfl/NflQBProjections";
import NflRBProjections from "./pages/nfl/NflRBProjections";
import NflWRProjections from "./pages/nfl/NflWRProjections";
import NflTEProjections from "./pages/nfl/NflTEProjections";

// position data
import NflQBData from "./pages/nfl/NflQBData";
import NflRBData from "./pages/nfl/NflRBData";
import NflWRData from "./pages/nfl/NflWRData";
import NflTEData from "./pages/nfl/NflTEData";
// import NflDSTData from "./pages/nfl/NflDSTData";

// NEW: NFL Gameboard (Matchups)
import NflGameboard from "./pages/nfl/NflGameboard";

/* ---------------- NFL (SHOWDOWN) ---------------- */
import NflProjectionsShowdown from "./pages/nfl/NflProjectionsShowdown";
import NFLShowdownOptimizer from "./pages/nfl/NFLShowdownOptimizer"; // ← added

// If you created these showdown wrappers, keep these imports.
// Otherwise, remove the ones you don't have yet.
import NflQBDataShowdown from "./pages/nfl/NflQBDataShowdown";
import NflRBDataShowdown from "./pages/nfl/NflRBDataShowdown";
import NflWRDataShowdown from "./pages/nfl/NflWRDataShowdown";
import NflTEDataShowdown from "./pages/nfl/NflTEDataShowdown";
// import NflDSTDataShowdown from "./pages/nfl/NflDSTDataShowdown";

import NflQBProjectionsShowdown from "./pages/nfl/NflQBProjectionsShowdown";
import NflRBProjectionsShowdown from "./pages/nfl/NflRBProjectionsShowdown";
import NflWRProjectionsShowdown from "./pages/nfl/NflWRProjectionsShowdown";
import NflTEProjectionsShowdown from "./pages/nfl/NflTEProjectionsShowdown";
// import NflDSTProjectionsShowdown from "./pages/nfl/NflDSTProjectionsShowdown";

/* ---------------- MLB ---------------- */
import MlbPitcherProjections from "./pages/mlb/MlbPitcherProjections";
import MlbBattersProjections from "./pages/mlb/MlbBattersProjections";
import MlbStacks from "./pages/mlb/MlbStacks"; // ← NEW import

function NotFound() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-gray-600">Check the URL or use the navigation.</p>
    </div>
  );
}

// Layout that gates all nested sports routes using path-based rules + modal
function SportsGateLayout() {
  return (
    <ProtectedByPathModal>
      <Outlet />
    </ProtectedByPathModal>
  );
}

export default function App() {
  // Track logged-in user (some components still read this prop)
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    // initial session
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    // listen for changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <NavBar />
        <main className="flex-1">
          <Routes>
            {/* ---------- Public ---------- */}
            <Route path="/" element={<HomePage />} />
            <Route path="/pricing" element={<PricingPage />} />

            {/* ---------- Auth ---------- */}
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />

            {/* ---------- Account (login-only, never plan-gated) ---------- */}
            <Route
              path="/account"
              element={
                <AuthOnly>
                  <AccountPage />
                </AuthOnly>
              }
            />
            {/* Back-compat */}
            <Route path="/dashboard" element={<Navigate to="/account" replace />} />

            {/* ---------- GATED SPORTS AREA (all nested routes obey gateConfig rules) ---------- */}
            <Route element={<SportsGateLayout />}>
              {/* ============ NASCAR → CUP ============ */}
              <Route path="/nascar/cup/dfs-projections" element={<CupProjections />} />
              <Route path="/nascar/cup/projections" element={<Navigate to="/nascar/cup/dfs-projections" replace />} />
              <Route path="/nascar/cup/odds" element={<CupOdds />} />
              <Route path="/nascar/cup/betting-sims" element={<CupOdds />} />
              <Route path="/nascar/cup/sims" element={<CupOdds />} />
              <Route path="/nascar/cup/gfs" element={<CupGfs />} />
              <Route path="/nascar/cup/practice" element={<CupPractice />} />
              <Route path="/nascar/cup/cheatsheets" element={<CupCheatSheets />} />
              <Route path="/nascar/cup/cheat-sheets" element={<Navigate to="/nascar/cup/cheatsheets" replace />} />
              <Route path="/nascar/cup/optimizer" element={<CupOptimizer />} />
              <Route path="/nascar/cup/data" element={<CupData />} />

              {/* ============ NASCAR → XFINITY ============ */}
              <Route path="/nascar/xfinity/dfs-projections" element={<XfProjections />} />
              <Route path="/nascar/xfinity/projections" element={<Navigate to="/nascar/xfinity/dfs-projections" replace />} />
              <Route path="/nascar/xfinity/odds" element={<XfOdds />} />
              <Route path="/nascar/xfinity/betting-sims" element={<XfOdds />} />
              <Route path="/nascar/xfinity/sims" element={<XfOdds />} />
              <Route path="/nascar/xfinity/gfs" element={<XfGfs />} />
              <Route path="/nascar/xfinity/practice" element={<XfPractice />} />
              <Route path="/nascar/xfinity/cheatsheets" element={<XfCheatSheets />} />
              <Route path="/nascar/xfinity/cheat-sheets" element={<Navigate to="/nascar/xfinity/cheatsheets" replace />} />
              <Route path="/nascar/xfinity/optimizer" element={<XfOptimizer />} />
              <Route path="/nascar/xfinity/data" element={<XfData />} />

              {/* ============ NASCAR → TRUCKS ============ */}
              <Route path="/nascar/trucks/dfs-projections" element={<TrucksProjections />} />
              <Route path="/nascar/trucks/projections" element={<Navigate to="/nascar/trucks/dfs-projections" replace />} />
              <Route path="/nascar/trucks/odds" element={<TrucksOdds />} />
              <Route path="/nascar/trucks/betting-sims" element={<TrucksOdds />} />
              <Route path="/nascar/trucks/sims" element={<TrucksOdds />} />
              <Route path="/nascar/trucks/gfs" element={<TrucksGfs />} />
              <Route path="/nascar/trucks/practice" element={<TrucksPractice />} />
              <Route path="/nascar/trucks/cheatsheets" element={<TrucksCheatSheets />} />
              <Route path="/nascar/trucks/cheat-sheets" element={<Navigate to="/nascar/trucks/cheatsheets" replace />} />
              <Route path="/nascar/trucks/optimizer" element={<TrucksOptimizer />} />
              <Route path="/nascar/trucks/data" element={<TrucksData />} />

              {/* Default NASCAR redirect */}
              <Route path="/nascar" element={<Navigate to="/nascar/cup/dfs-projections" replace />} />

              {/* ============ NFL — CLASSIC ============ */}
              <Route path="/nfl/classic/projections" element={<NflProjections />} />
              <Route path="/nfl/classic/stacks" element={<NflStacks />} />
              <Route path="/nfl/classic/cheatsheets" element={<NflCheatSheets />} />
              <Route path="/nfl/classic/optimizer" element={<NFLOptimizer />} />

              {/* Projections by position */}
              <Route path="/nfl/classic/qb-projections" element={<NflQBProjections />} />
              <Route path="/nfl/classic/rb-projections" element={<NflRBProjections />} />
              <Route path="/nfl/classic/wr-projections" element={<NflWRProjections />} />
              <Route path="/nfl/classic/te-projections" element={<NflTEProjections />} />

              {/* Data tables by position */}
              <Route path="/nfl/classic/qb-data" element={<NflQBData />} />
              <Route path="/nfl/classic/rb-data" element={<NflRBData />} />
              <Route path="/nfl/classic/wr-data" element={<NflWRData />} />
              <Route path="/nfl/classic/te-data" element={<NflTEData />} />
              {/* <Route path="/nfl/classic/dst-data" element={<NflDSTData />} /> */}

              {/* NEW: NFL Gameboard (Matchups) */}
              <Route path="/nfl/classic/nfl-gameboard" element={<NflGameboard />} />
              <Route path="/nfl/classic/gameboard" element={<Navigate to="/nfl/classic/nfl-gameboard" replace />} />

              {/* Optional shortcut to optimizer */}
              <Route path="/nfl/optimizer" element={<Navigate to="/nfl/classic/optimizer" replace />} />
              <Route path="/nfl/classic" element={<Navigate to="/nfl/classic/projections" replace />} />

              {/* Backward-compat redirects to CLASSIC */}
              <Route path="/nfl/projections" element={<Navigate to="/nfl/classic/projections" replace />} />
              <Route path="/nfl/dfs-projections" element={<Navigate to="/nfl/classic/projections" replace />} />

              {/* ============ NFL — SHOWDOWN ============ */}
              {/* All-positions showdown */}
              <Route path="/nfl/showdown/projections" element={<NflProjectionsShowdown />} />
              <Route path="/nfl/showdown/optimizer" element={<NFLShowdownOptimizer />} />

              {/* Showdown by position — DATA */}
              <Route path="/nfl/showdown/qb-data" element={<NflQBDataShowdown />} />
              <Route path="/nfl/showdown/rb-data" element={<NflRBDataShowdown />} />
              <Route path="/nfl/showdown/wr-data" element={<NflWRDataShowdown />} />
              <Route path="/nfl/showdown/te-data" element={<NflTEDataShowdown />} />
              {/* <Route path="/nfl/showdown/dst-data" element={<NflDSTDataShowdown />} /> */}

              {/* Showdown by position — PROJECTIONS */}
              <Route path="/nfl/showdown/qb-projections" element={<NflQBProjectionsShowdown />} />
              <Route path="/nfl/showdown/rb-projections" element={<NflRBProjectionsShowdown />} />
              <Route path="/nfl/showdown/wr-projections" element={<NflWRProjectionsShowdown />} />
              <Route path="/nfl/showdown/te-projections" element={<NflTEProjectionsShowdown />} />
              {/* <Route path="/nfl/showdown/dst-projections" element={<NflDSTProjectionsShowdown />} /> */}

              {/* Default NFL redirect */}
              <Route path="/nfl/showdown" element={<Navigate to="/nfl/showdown/projections" replace />} />
              <Route path="/nfl" element={<Navigate to="/nfl/classic/projections" replace />} />

              {/* ============ MLB ============ */}
              <Route path="/mlb/pitcher-projections" element={<MlbPitcherProjections />} />
              <Route path="/mlb/batter-projections" element={<MlbBattersProjections />} />
              <Route path="/mlb/batters" element={<Navigate to="/mlb/batter-projections" replace />} />
              <Route path="/mlb/hitters" element={<Navigate to="/mlb/batter-projections" replace />} />
              <Route path="/mlb/stacks" element={<MlbStacks />} /> {/* ← NEW route */}
              <Route path="/mlb/cheatsheets" element={<Navigate to="/mlb/stacks" replace />} />

              {/* Default MLB redirect */}
              <Route path="/mlb" element={<Navigate to="/mlb/pitcher-projections" replace />} />
            </Route>

            {/* ---------- 404 ---------- */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
