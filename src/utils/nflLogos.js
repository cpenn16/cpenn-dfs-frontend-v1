// src/utils/nflLogos.js

const CANONICAL = {
  WSH: "WAS",
  JAC: "JAX",
  LA:  "LAR",
  STL: "LAR",
  SD:  "LAC",
  OAK: "LV",
};

const ALTS = {
  WAS: ["WSH"], WSH: ["WAS"],
  JAX: ["JAC"], JAC: ["JAX"],
  LAR: ["LA", "STL"], LA: ["LAR"], STL: ["LAR"],
  LAC: ["SD"], SD: ["LAC"],
  LV:  ["OAK"], OAK: ["LV"],
};

function uniq(arr) { return [...new Set(arr)]; }

export function nflLogoCandidates(abbr) {
  const up = String(abbr || "").trim().toUpperCase();
  if (!up) return [];
  const canon = CANONICAL[up] || up;
  const alts = (ALTS[up] || ALTS[canon] || []).map(s => s.toUpperCase());
  const names = uniq([up, canon, ...alts, up.toLowerCase()]);
  return names.map(n => `/logos/nfl/${n}.png`);
}
