// src/config/site.js
// Central place to control where your JSON lives.
// Optional env override: REACT_APP_DATA_BASE_URL (CRA) or VITE_DATA_BASE_URL (Vite)

const fromEnv =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_DATA_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_DATA_BASE_URL) ||
  "";

export const SITE = {
  BASE_URL: (fromEnv || "/data/nascar/cup/latest").replace(/\/+$/, ""),
};

export const url = (path) => {
  const clean = String(path || "").replace(/^\/+/, "");
  return `${SITE.BASE_URL}/${clean}`;
};
