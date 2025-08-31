import { ALLOW_NASCAR, ALLOW_NFL, ALLOW_NBA, ALLOW_MLB, ALLOW_ALL_ACCESS, ALLOW_DISCORD } from "./plans";

export const ROUTE_RULES = [
  { prefix: "/nascar", allow: ALLOW_NASCAR },
  { prefix: "/nfl",    allow: ALLOW_NFL },
  { prefix: "/nba",    allow: ALLOW_NBA },
  { prefix: "/mlb",    allow: ALLOW_MLB },

  // pages just for all-access
  { prefix: "/all",    allow: ALLOW_ALL_ACCESS },

  // discord utilities
  { prefix: "/discord", allow: ALLOW_DISCORD },
];
