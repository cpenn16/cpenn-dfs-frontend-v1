// src/auth/gateConfig.js
import { PLANS, NASCAR_ALL, MLB_ALL, NFL_ALL, NBA_ALL } from "./plans";

/**
 * Rules are matched in order; first match wins.
 * - Optimizers: PRO only (plus ALL_ACCESS_PRO)
 * - Sport sections: LITE or PRO (plus ALL_ACCESS_LITE/PRO)
 */
export const ROUTE_RULES = [
  /* ================= OPTIMIZERS (PRO + ALL_ACCESS_PRO) ================= */

  // NASCAR optimizers (cup/xfinity/trucks)
  { prefix: "/nascar/cup/optimizer",     allow: [PLANS.NASCAR_PRO, PLANS.ALL_ACCESS_PRO] },
  { prefix: "/nascar/xfinity/optimizer", allow: [PLANS.NASCAR_PRO, PLANS.ALL_ACCESS_PRO] },
  { prefix: "/nascar/trucks/optimizer",  allow: [PLANS.NASCAR_PRO, PLANS.ALL_ACCESS_PRO] },

  // MLB optimizer
  { prefix: "/mlb/optimizer",            allow: [PLANS.MLB_PRO,    PLANS.ALL_ACCESS_PRO] },

  // NBA optimizer
  { prefix: "/nba/optimizer",            allow: [PLANS.NBA_PRO,    PLANS.ALL_ACCESS_PRO] },

  // NFL optimizers (classic + showdown + legacy shortcut)
  { prefix: "/nfl/classic/optimizer",    allow: [PLANS.NFL_PRO,    PLANS.ALL_ACCESS_PRO] },
  { prefix: "/nfl/showdown/optimizer",   allow: [PLANS.NFL_PRO,    PLANS.ALL_ACCESS_PRO] },
  { prefix: "/nfl/optimizer",            allow: [PLANS.NFL_PRO,    PLANS.ALL_ACCESS_PRO] },

  /* ================== SPORT SECTIONS (LITE or PRO + ALL_ACCESS) ================== */

  // All NASCAR (cup/xfinity/trucks) — lite gets everything EXCEPT optimizers (handled above)
  { prefix: "/nascar", allow: NASCAR_ALL },

  // MLB
  { prefix: "/mlb",    allow: MLB_ALL },

  // NFL (classic + showdown)
  { prefix: "/nfl",    allow: NFL_ALL },

  // NBA
  { prefix: "/nba",    allow: NBA_ALL },
];
