// src/components/NavBar.jsx
import { Link, NavLink } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

/* ========================== Desktop hover helpers ========================== */
function HoverMenu({ label, children, cols = 1, widthClass = "w-80" }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const gridCols =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";

  const openNow = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    timer.current = setTimeout(() => setOpen(false), 160);
  };

  return (
    <li className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        className="px-4 py-2 rounded-md text-white/90 hover:bg-blue-700 focus:outline-none"
        type="button"
      >
        {label}
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full mt-2 z-[60] ${widthClass} rounded-xl bg-white shadow-xl ring-1 ring-black/10`}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          <div className={`grid ${gridCols} gap-4 p-3 max-h-[70vh] overflow-y-auto`}>
            {children}
          </div>
        </div>
      )}
    </li>
  );
}

function SectionTitle({ children }) {
  return (
    <div className="sticky top-0 z-10 -mx-3 px-3 pt-2 pb-1 text-xs font-extrabold tracking-wide text-blue-800 bg-white/90 backdrop-blur">
      {children}
    </div>
  );
}

function MenuGroup({ children }) {
  return <div className="flex flex-col gap-1">{children}</div>;
}

function MenuItem({ to, children }) {
  return (
    <Link
      to={to}
      className="block px-3 py-2 rounded-md text-[15px] text-slate-800 hover:bg-blue-50"
    >
      {children}
    </Link>
  );
}

/* ============================ Mobile drawer bits =========================== */
function AccordionItem({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-medium"
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function MobileLink({ to, children, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className="block px-8 py-2 text-[15px] hover:bg-blue-50 rounded-md"
    >
      {children}
    </NavLink>
  );
}

/* ================================= NavBar ================================= */
export default function NavBar() {
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <nav className="bg-blue-900 text-white sticky top-0 z-50 shadow">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header row */}
        <div className="flex items-center justify-between h-14">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/img/logo.png"
              alt="Cpenn DFS"
              className="h-8 w-8 object-contain"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <span className="font-extrabold tracking-wide">Cpenn DFS</span>
          </Link>

          {/* Desktop menus */}
          <ul className="hidden md:flex items-center gap-2">
            {/* NASCAR */}
            <HoverMenu label="NASCAR" cols={2} widthClass="w-[36rem]">
              <MenuGroup>
                <SectionTitle>CUP</SectionTitle>
                <MenuItem to="/nascar/cup/data">Data</MenuItem>
                <MenuItem to="/nascar/cup/projections">DFS Projections</MenuItem>
                <MenuItem to="/nascar/cup/betting-sims">Betting Sims</MenuItem>
                <MenuItem to="/nascar/cup/practice">Practice</MenuItem>
                <MenuItem to="/nascar/cup/cheatsheets">Cheat Sheets</MenuItem>
                <MenuItem to="/nascar/cup/gfs">GFS</MenuItem>
                <MenuItem to="/nascar/cup/optimizer">Optimizer</MenuItem>
                <MenuItem to="/nascar/cup/article">Article</MenuItem>
              </MenuGroup>

              <MenuGroup>
                <SectionTitle>XFINITY</SectionTitle>
                <MenuItem to="/nascar/xfinity/data">Data</MenuItem>
                <MenuItem to="/nascar/xfinity/projections">DFS Projections</MenuItem>
                <MenuItem to="/nascar/xfinity/sims">Betting Sims</MenuItem>
                <MenuItem to="/nascar/xfinity/practice">Practice</MenuItem>
                <MenuItem to="/nascar/xfinity/cheatsheets">Cheat Sheets</MenuItem>
                <MenuItem to="/nascar/xfinity/gfs">GFS</MenuItem>
                <MenuItem to="/nascar/xfinity/optimizer">Optimizer</MenuItem>

                <div className="my-2 border-t border-slate-200" />

                <SectionTitle>TRUCKS</SectionTitle>
                <MenuItem to="/nascar/trucks/data">Data</MenuItem>
                <MenuItem to="/nascar/trucks/projections">DFS Projections</MenuItem>
                <MenuItem to="/nascar/trucks/sims">Betting Sims</MenuItem>
                <MenuItem to="/nascar/trucks/practice">Practice</MenuItem>
                <MenuItem to="/nascar/trucks/cheatsheets">Cheat Sheets</MenuItem>
                <MenuItem to="/nascar/trucks/gfs">GFS</MenuItem>
                <MenuItem to="/nascar/trucks/optimizer">Optimizer</MenuItem>
              </MenuGroup>
            </HoverMenu>

            {/* NFL */}
            <HoverMenu label="NFL" cols={3} widthClass="w-[56rem]">
              <MenuGroup>
                <SectionTitle>CLASSIC</SectionTitle>
                <MenuItem to="/nfl/classic/projections">DFS Projections</MenuItem>
                <MenuItem to="/nfl/classic/stacks">Stacks</MenuItem>
                <MenuItem to="/nfl/classic/cheatsheets">Cheat Sheets</MenuItem>
                <MenuItem to="/nfl/classic/qb-projections">QB Projections</MenuItem>
                <MenuItem to="/nfl/classic/rb-projections">RB Projections</MenuItem>
                <MenuItem to="/nfl/classic/wr-projections">WR Projections</MenuItem>
                <MenuItem to="/nfl/classic/te-projections">TE Projections</MenuItem>
                <MenuItem to="/nfl/classic/qb-data">QB Data</MenuItem>
                <MenuItem to="/nfl/classic/rb-data">RB Data</MenuItem>
                <MenuItem to="/nfl/classic/wr-data">WR Data</MenuItem>
                <MenuItem to="/nfl/classic/te-data">TE Data</MenuItem>
                <MenuItem to="/nfl/classic/nfl-gameboard">NFL Matchups</MenuItem>
                <MenuItem to="/nfl/classic/optimizer">Optimizer</MenuItem>
              </MenuGroup>

              <MenuGroup>
                <SectionTitle>SHOWDOWN</SectionTitle>
                <MenuItem to="/nfl/showdown/projections">DFS Projections</MenuItem>
                <MenuItem to="/nfl/showdown/qb-projections">QB Projections</MenuItem>
                <MenuItem to="/nfl/showdown/rb-projections">RB Projections</MenuItem>
                <MenuItem to="/nfl/showdown/wr-projections">WR Projections</MenuItem>
                <MenuItem to="/nfl/showdown/te-projections">TE Projections</MenuItem>
                <MenuItem to="/nfl/showdown/qb-data">QB Data</MenuItem>
                <MenuItem to="/nfl/showdown/rb-data">RB Data</MenuItem>
                <MenuItem to="/nfl/showdown/wr-data">WR Data</MenuItem>
                <MenuItem to="/nfl/showdown/te-data">TE Data</MenuItem>
                <MenuItem to="/nfl/showdown/nfl-gameboard">NFL Matchups</MenuItem>
                <MenuItem to="/nfl/showdown/optimizer">Optimizer</MenuItem>
              </MenuGroup>
            </HoverMenu>

            {/* MLB */}
            <HoverMenu label="MLB">
              <MenuItem to="/mlb/pitcher-projections">Pitcher Projections</MenuItem>
              <MenuItem to="/mlb/batter-projections">Batter Projections</MenuItem>
              <MenuItem to="/mlb/stacks">Stacks</MenuItem>
              <MenuItem to="/mlb/cheatsheets">Cheat Sheets</MenuItem>
              <MenuItem to="/mlb/pitchers">Pitcher Data</MenuItem>
              <MenuItem to="/mlb/batter-data">Batter Data</MenuItem>
              <MenuItem to="/mlb/matchups">MLB Matchups</MenuItem>
              <MenuItem to="/mlb/optimizer">Optimizer</MenuItem>
            </HoverMenu>

            {/* NBA */}
            <HoverMenu label="NBA">
              <MenuItem to="/nba/projections">DFS Projections</MenuItem>
              <MenuItem to="/nba/cheatsheets">Cheat Sheets</MenuItem>
              <MenuItem to="/nba/optimizer">Optimizer</MenuItem>
            </HoverMenu>
          </ul>

          {/* Right side (desktop) */}
          <div className="hidden md:flex items-center gap-2">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md ${isActive ? "bg-blue-700" : "hover:bg-blue-700"}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md ${isActive ? "bg-blue-700" : "hover:bg-blue-700"}`
              }
            >
              Pricing
            </NavLink>

            <span className="mx-1 h-6 w-px bg-white/20" />

            {!user ? (
              <>
                <NavLink
                  to="/login"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md ${isActive ? "bg-blue-700" : "hover:bg-blue-700"}`
                  }
                >
                  Login
                </NavLink>
                <Link
                  to="/signup"
                  className="ml-1 rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-gray-100"
                >
                  Sign Up
                </Link>
              </>
            ) : (
              <>
                <NavLink
                  to="/account"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md ${isActive ? "bg-blue-700" : "hover:bg-blue-700"}`
                  }
                >
                  Account
                </NavLink>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded-md hover:bg-blue-700"
                >
                  Logout
                </button>
              </>
            )}
          </div>

          {/* Hamburger (mobile) */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-blue-800"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-[92%] max-w-sm bg-white text-slate-900 shadow-xl">
            <div className="flex items-center justify-between px-4 h-14 border-b">
              <span className="font-bold">Menu</span>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-md hover:bg-slate-100"
              >
                <svg width="22" height="22" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Make the drawer contents scrollable so all items are reachable */}
            <div className="px-2 py-3 space-y-1 overflow-y-auto h-[calc(100%-3.5rem)]">
              {/* quick links */}
              <NavLink to="/" onClick={closeMobile} className="block px-4 py-2 rounded-md hover:bg-blue-50">
                Home
              </NavLink>
              <NavLink to="/pricing" onClick={closeMobile} className="block px-4 py-2 rounded-md hover:bg-blue-50">
                Pricing
              </NavLink>

              <div className="my-2 border-t" />

              {!user ? (
                <>
                  <NavLink to="/login" onClick={closeMobile} className="block px-4 py-2 rounded-md hover:bg-blue-50">
                    Login
                  </NavLink>
                  <NavLink to="/signup" onClick={closeMobile} className="block px-4 py-2 rounded-md hover:bg-blue-50">
                    Sign Up
                  </NavLink>
                </>
              ) : (
                <>
                  <NavLink to="/account" onClick={closeMobile} className="block px-4 py-2 rounded-md hover:bg-blue-50">
                    Account
                  </NavLink>
                  <button
                    onClick={() => {
                      closeMobile();
                      logout();
                    }}
                    className="w-full text-left px-4 py-2 rounded-md hover:bg-blue-50"
                  >
                    Logout
                  </button>
                </>
              )}

              <div className="my-2 border-t" />

              {/* Sports accordions */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                {/* NASCAR (full set) */}
                <AccordionItem title="NASCAR" defaultOpen={true}>
                  {/* CUP */}
                  <div className="px-4 py-1 text-xs font-bold tracking-widest text-slate-500">CUP</div>
                  <MobileLink to="/nascar/cup/data" onClick={closeMobile}>Data</MobileLink>
                  <MobileLink to="/nascar/cup/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nascar/cup/betting-sims" onClick={closeMobile}>Betting Sims</MobileLink>
                  <MobileLink to="/nascar/cup/practice" onClick={closeMobile}>Practice</MobileLink>
                  <MobileLink to="/nascar/cup/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/nascar/cup/gfs" onClick={closeMobile}>GFS</MobileLink>
                  <MobileLink to="/nascar/cup/optimizer" onClick={closeMobile}>Optimizer</MobileLink>
                  <MobileLink to="/nascar/cup/article" onClick={closeMobile}>Article</MobileLink>

                  {/* XFINITY */}
                  <div className="px-4 pt-3 pb-1 text-xs font-bold tracking-widest text-slate-500">XFINITY</div>
                  <MobileLink to="/nascar/xfinity/data" onClick={closeMobile}>Data</MobileLink>
                  <MobileLink to="/nascar/xfinity/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nascar/xfinity/sims" onClick={closeMobile}>Betting Sims</MobileLink>
                  <MobileLink to="/nascar/xfinity/practice" onClick={closeMobile}>Practice</MobileLink>
                  <MobileLink to="/nascar/xfinity/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/nascar/xfinity/gfs" onClick={closeMobile}>GFS</MobileLink>
                  <MobileLink to="/nascar/xfinity/optimizer" onClick={closeMobile}>Optimizer</MobileLink>

                  {/* TRUCKS */}
                  <div className="px-4 pt-3 pb-1 text-xs font-bold tracking-widest text-slate-500">TRUCKS</div>
                  <MobileLink to="/nascar/trucks/data" onClick={closeMobile}>Data</MobileLink>
                  <MobileLink to="/nascar/trucks/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nascar/trucks/sims" onClick={closeMobile}>Betting Sims</MobileLink>
                  <MobileLink to="/nascar/trucks/practice" onClick={closeMobile}>Practice</MobileLink>
                  <MobileLink to="/nascar/trucks/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/nascar/trucks/gfs" onClick={closeMobile}>GFS</MobileLink>
                  <MobileLink to="/nascar/trucks/optimizer" onClick={closeMobile}>Optimizer</MobileLink>
                </AccordionItem>

                {/* NFL (Classic + Showdown) */}
                <AccordionItem title="NFL">
                  {/* CLASSIC */}
                  <div className="px-4 py-1 text-xs font-bold tracking-widest text-slate-500">CLASSIC</div>
                  <MobileLink to="/nfl/classic/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nfl/classic/stacks" onClick={closeMobile}>Stacks</MobileLink>
                  <MobileLink to="/nfl/classic/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/nfl/classic/qb-projections" onClick={closeMobile}>QB Projections</MobileLink>
                  <MobileLink to="/nfl/classic/rb-projections" onClick={closeMobile}>RB Projections</MobileLink>
                  <MobileLink to="/nfl/classic/wr-projections" onClick={closeMobile}>WR Projections</MobileLink>
                  <MobileLink to="/nfl/classic/te-projections" onClick={closeMobile}>TE Projections</MobileLink>

                  {/* ✅ add the DATA links (these were missing on mobile) */}
                  <MobileLink to="/nfl/classic/qb-data" onClick={closeMobile}>QB Data</MobileLink>
                  <MobileLink to="/nfl/classic/rb-data" onClick={closeMobile}>RB Data</MobileLink>
                  <MobileLink to="/nfl/classic/wr-data" onClick={closeMobile}>WR Data</MobileLink>
                  <MobileLink to="/nfl/classic/te-data" onClick={closeMobile}>TE Data</MobileLink>

                  <MobileLink to="/nfl/classic/nfl-gameboard" onClick={closeMobile}>NFL Matchups</MobileLink>
                  <MobileLink to="/nfl/classic/optimizer" onClick={closeMobile}>Optimizer</MobileLink>

                  {/* SHOWDOWN */}
                  <div className="px-4 pt-3 pb-1 text-xs font-bold tracking-widest text-slate-500">SHOWDOWN</div>
                  <MobileLink to="/nfl/showdown/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nfl/showdown/qb-projections" onClick={closeMobile}>QB Projections</MobileLink>
                  <MobileLink to="/nfl/showdown/rb-projections" onClick={closeMobile}>RB Projections</MobileLink>
                  <MobileLink to="/nfl/showdown/wr-projections" onClick={closeMobile}>WR Projections</MobileLink>
                  <MobileLink to="/nfl/showdown/te-projections" onClick={closeMobile}>TE Projections</MobileLink>

                  {/* ✅ add the DATA links (these were missing on mobile) */}
                  <MobileLink to="/nfl/showdown/qb-data" onClick={closeMobile}>QB Data</MobileLink>
                  <MobileLink to="/nfl/showdown/rb-data" onClick={closeMobile}>RB Data</MobileLink>
                  <MobileLink to="/nfl/showdown/wr-data" onClick={closeMobile}>WR Data</MobileLink>
                  <MobileLink to="/nfl/showdown/te-data" onClick={closeMobile}>TE Data</MobileLink>

                  <MobileLink to="/nfl/showdown/nfl-gameboard" onClick={closeMobile}>NFL Matchups</MobileLink>
                  <MobileLink to="/nfl/showdown/optimizer" onClick={closeMobile}>Optimizer</MobileLink>
                </AccordionItem>

                {/* MLB */}
                <AccordionItem title="MLB">
                  <MobileLink to="/mlb/pitcher-projections" onClick={closeMobile}>Pitcher Projections</MobileLink>
                  <MobileLink to="/mlb/batter-projections" onClick={closeMobile}>Batter Projections</MobileLink>
                  <MobileLink to="/mlb/stacks" onClick={closeMobile}>Stacks</MobileLink>
                  <MobileLink to="/mlb/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/mlb/pitchers" onClick={closeMobile}>Pitcher Data</MobileLink>
                  <MobileLink to="/mlb/batter-data" onClick={closeMobile}>Batter Data</MobileLink>
                  <MobileLink to="/mlb/matchups"           onClick={closeMobile}>MLB Matchups</MobileLink>
                  <MobileLink to="/mlb/optimizer" onClick={closeMobile}>Optimizer</MobileLink>
                </AccordionItem>

                {/* NBA */}
                <AccordionItem title="NBA">
                  <MobileLink to="/nba/projections" onClick={closeMobile}>DFS Projections</MobileLink>
                  <MobileLink to="/nba/cheatsheets" onClick={closeMobile}>Cheat Sheets</MobileLink>
                  <MobileLink to="/nba/optimizer" onClick={closeMobile}>Optimizer</MobileLink>
                </AccordionItem>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
