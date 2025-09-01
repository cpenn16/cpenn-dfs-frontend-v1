// src/auth/plans.js
export const PLANS = {
  FREE: 'free',
  DISCORD_ONLY: 'discord_only',

  NASCAR_LITE: 'nascar_lite',
  NASCAR_PRO: 'nascar_pro',

  MLB_LITE: 'mlb_lite',
  MLB_PRO: 'mlb_pro',

  NFL_LITE: 'nfl_lite',
  NFL_PRO: 'nfl_pro',

  NBA_LITE: 'nba_lite',
  NBA_PRO: 'nba_pro',

  ALL_ACCESS_LITE: 'all_access_lite',
  ALL_ACCESS_PRO: 'all_access_pro',
};

// Any of these should unlock /nascar (except optimizers, which are PRO-only rules)
export const NASCAR_ALL = [
  PLANS.NASCAR_LITE, PLANS.NASCAR_PRO,
  PLANS.ALL_ACCESS_LITE, PLANS.ALL_ACCESS_PRO
];

export const MLB_ALL = [
  PLANS.MLB_LITE, PLANS.MLB_PRO,
  PLANS.ALL_ACCESS_LITE, PLANS.ALL_ACCESS_PRO
];

export const NFL_ALL = [
  PLANS.NFL_LITE, PLANS.NFL_PRO,
  PLANS.ALL_ACCESS_LITE, PLANS.ALL_ACCESS_PRO
];

export const NBA_ALL = [
  PLANS.NBA_LITE, PLANS.NBA_PRO,
  PLANS.ALL_ACCESS_LITE, PLANS.ALL_ACCESS_PRO
];
