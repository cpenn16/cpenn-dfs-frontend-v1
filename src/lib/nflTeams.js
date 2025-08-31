// src/lib/nflTeams.js

// ---------- canonical teams ----------
export const NFL_TEAMS = {
  ARI: { name: "Arizona Cardinals",   primary: "#97233F", secondary: "#000000", text: "#FFFFFF", accent: "#FFB612" },
  ATL: { name: "Atlanta Falcons",     primary: "#A71930", secondary: "#000000", text: "#FFFFFF", accent: "#C0C0C0" },
  BAL: { name: "Baltimore Ravens",    primary: "#241773", secondary: "#000000", text: "#FFFFFF", accent: "#9E7C0C" },
  BUF: { name: "Buffalo Bills",       primary: "#00338D", secondary: "#C60C30", text: "#FFFFFF", accent: "#C60C30" },
  CAR: { name: "Carolina Panthers",   primary: "#0085CA", secondary: "#000000", text: "#FFFFFF", accent: "#BFC0BF" },
  CHI: { name: "Chicago Bears",       primary: "#0B162A", secondary: "#C83803", text: "#FFFFFF", accent: "#C83803" },
  CIN: { name: "Cincinnati Bengals",  primary: "#FB4F14", secondary: "#000000", text: "#000000", accent: "#000000" },
  CLE: { name: "Cleveland Browns",    primary: "#311D00", secondary: "#FF3C00", text: "#FFFFFF", accent: "#FF3C00" },
  DAL: { name: "Dallas Cowboys",      primary: "#003594", secondary: "#869397", text: "#FFFFFF", accent: "#B0B7BC" },
  DEN: { name: "Denver Broncos",      primary: "#002244", secondary: "#FB4F14", text: "#FFFFFF", accent: "#FB4F14" },
  DET: { name: "Detroit Lions",       primary: "#0076B6", secondary: "#B0B7BC", text: "#FFFFFF", accent: "#B0B7BC" },
  GB:  { name: "Green Bay Packers",   primary: "#203731", secondary: "#FFB612", text: "#FFFFFF", accent: "#FFB612" },
  HOU: { name: "Houston Texans",      primary: "#03202F", secondary: "#A71930", text: "#FFFFFF", accent: "#A71930" },
  IND: { name: "Indianapolis Colts",  primary: "#002C5F", secondary: "#FFFFFF", text: "#FFFFFF", accent: "#A2AAAD" },
  JAX: { name: "Jacksonville Jaguars",primary: "#006778", secondary: "#101820", text: "#FFFFFF", accent: "#9F792C" },
  KC:  { name: "Kansas City Chiefs",  primary: "#E31837", secondary: "#FFB81C", text: "#FFFFFF", accent: "#FFB81C" },
  LAC: { name: "Los Angeles Chargers",primary: "#0080C6", secondary: "#FFC20E", text: "#FFFFFF", accent: "#FFC20E" },
  LAR: { name: "Los Angeles Rams",    primary: "#003594", secondary: "#FFA300", text: "#FFFFFF", accent: "#FFA300" },
  LV:  { name: "Las Vegas Raiders",   primary: "#000000", secondary: "#A5ACAF", text: "#FFFFFF", accent: "#A5ACAF" },
  MIA: { name: "Miami Dolphins",      primary: "#008E97", secondary: "#F26A24", text: "#FFFFFF", accent: "#F26A24" },
  MIN: { name: "Minnesota Vikings",   primary: "#4F2683", secondary: "#FFC62F", text: "#FFFFFF", accent: "#FFC62F" },
  NE:  { name: "New England Patriots",primary: "#002244", secondary: "#C60C30", text: "#FFFFFF", accent: "#B0B7BC" },
  NO:  { name: "New Orleans Saints",  primary: "#D3BC8D", secondary: "#101820", text: "#101820", accent: "#000000" },
  NYG: { name: "New York Giants",     primary: "#0B2265", secondary: "#A71930", text: "#FFFFFF", accent: "#A71930" },
  NYJ: { name: "New York Jets",       primary: "#125740", secondary: "#FFFFFF", text: "#FFFFFF", accent: "#000000" },
  PHI: { name: "Philadelphia Eagles", primary: "#004C54", secondary: "#A5ACAF", text: "#FFFFFF", accent: "#A5ACAF" },
  PIT: { name: "Pittsburgh Steelers", primary: "#FFB612", secondary: "#101820", text: "#101820", accent: "#101820" },
  SEA: { name: "Seattle Seahawks",    primary: "#002244", secondary: "#7A869A", text: "#FFFFFF", accent: "#A6E200" },
  SF:  { name: "San Francisco 49ers", primary: "#AA0000", secondary: "#B3995D", text: "#FFFFFF", accent: "#B3995D" },
  TB:  { name: "Tampa Bay Buccaneers",primary: "#D50A0A", secondary: "#3E2C2C", text: "#FFFFFF", accent: "#3E2C2C" },
  TEN: { name: "Tennessee Titans",    primary: "#0C2340", secondary: "#4B92DB", text: "#FFFFFF", accent: "#C8102E" },
  WAS: { name: "Washington Commanders",primary:"#773141", secondary:"#FFB612", text:"#FFFFFF", accent:"#FFB612" },
};

// ---------- common aliases ----------
export const TEAM_ALIAS = {
  JAC: "JAX",
  WSH: "WAS",
  WFT: "WAS",
  OAK: "LV",
  STL: "LAR",
  SD:  "LAC",
  LA:  "LAR",  // occasional shorthand for the Rams
};

// ---------- helpers ----------
export function normalizeTeam(code = "") {
  const k = String(code || "").trim().toUpperCase();
  return TEAM_ALIAS[k] || k;
}

export function getTeam(code) {
  const k = normalizeTeam(code);
  return NFL_TEAMS[k] || {
    name: k || "Unknown",
    primary: "#1F2937", // slate-800
    secondary: "#6B7280", // gray-500
    text: "#FFFFFF",
    accent: "#9CA3AF",
  };
}

export function teamName(code) {
  return getTeam(code).name;
}

export function teamColors(code) {
  const t = getTeam(code);
  return { primary: t.primary, secondary: t.secondary, text: t.text, accent: t.accent };
}

// Path to YOUR logos (public/logos/nfl/*.png)
const LOGO_FALLBACKS = {
  LAR: ["LAR", "LA", "STL"],
  LAC: ["LAC", "LA", "SD"],
  LV:  ["LV", "OAK"],
};

export function logoPath(code) {
  const k = normalizeTeam(code);
  // just return the canonical path; files live in /public/logos/nfl/*.png
  return `/logos/nfl/${k}.png`;
}

// (Optional) if you want a list of candidate paths for a smart <img> fallback:
export function logoCandidates(code) {
  const k = normalizeTeam(code);
  const list = LOGO_FALLBACKS[k] || [k];
  return [...new Set(list)].map((x) => `/logos/nfl/${x}.png`);
}
