export const nflBase = (mode /* "classic" | "showdown" */) =>
  `/data/nfl/${mode}/latest`;

export const nflFile = (mode, file /* e.g. "projections" */) =>
  `${nflBase(mode)}/${file}.json`;
