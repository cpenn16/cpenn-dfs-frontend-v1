
# cpenn-dfs Frontend (clean)

Changes:
- Fixed progress bar off-by-one: progress can now reach N/N (no N-1 stall).
- Kept per-optimizer `solveStream` with robust parsing; backend now sends messages separated by double newlines to match the client.
- Updated NFL API endpoints to `/nfl/solve_stream` and `/nfl/solve` in `src/utils/api.js`.

How to run locally:
1. Install: `npm i`
2. Dev server: `npm run dev` (or `npm start`, depending on your setup)
3. Ensure `REACT_APP_API_BASE_URL` (or the default in `src/utils/api.js`) points to your backend.

Deploy:
- Build with your usual workflow.
