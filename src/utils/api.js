// src/utils/api.js
const hardcoded = "https://optimizer-server-v1.onrender.com";

const fromEnv =
  typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL
    ? process.env.REACT_APP_API_BASE_URL
    : null;

// If you ever change domains, change this in one place.
const API_BASE =
  (typeof window !== "undefined" && window.__API_BASE__) ||
  fromEnv ||
  hardcoded;

export default API_BASE;

/* ------------ small helpers so pages don't repeat fetch logic ----------- */
export async function postJSON(url, body, opts = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: JSON.stringify(body),
  });
  return res;
}

/**
 * Probe Cup endpoints in order, returning the first one that responds with a non-404.
 * If streaming==true, we try the *_stream variants first.
 * Always includes { series: "cup" } in the payload for generic endpoints.
 */
export async function probeAndPostCup(payload, { streaming = false } = {}) {
  const p = { ...payload, series: payload.series || "cup" };

  // Try most specific → least specific
  const paths = streaming
    ? ["/cup/solve_stream", "/nascar/cup/solve_stream", "/solve_stream", "/solve"]
    : ["/cup/solve", "/nascar/cup/solve", "/solve"];

  // Try each path until we get something that isn't a 404
  for (const path of paths) {
    const url = `${API_BASE}${path}`;
    try {
      const res = await postJSON(url, p);
      if (res.status !== 404) {
        // Found a working path
        return { url, res };
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[Cup probe] ${path} -> 404`);
      }
    } catch (e) {
      // Network or CORS—log and keep probing
      // eslint-disable-next-line no-console
      console.warn(`[Cup probe] ${path} -> ${e}`);
    }
  }
  throw new Error("No working Cup endpoint found.");
}