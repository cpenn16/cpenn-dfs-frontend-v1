// src/utils/api.js

// Base URL for the optimizer server
export const API_BASE =
  process.env.REACT_APP_API_BASE_URL || "https://optimizer-server.onrender.com";

// Convenience endpoints map (optional helper)
export const ENDPOINTS = {
  cup: {
    stream: "/cup/solve_stream",
    solve: "/cup/solve",
  },
  xfinity: {
    stream: "/xfinity/solve_stream",
    solve: "/xfinity/solve",
  },
  trucks: {
    stream: "/trucks/solve_stream",
    solve: "/trucks/solve",
  },
  nfl: {
    stream: "/nfl/solve_stream",
    solve: "/nfl/solve",
  },
};

// Keep default export too so both styles work
export default API_BASE;
