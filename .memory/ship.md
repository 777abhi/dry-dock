## 2026-02-27 - [Whitelisting]
Decision: Implement Whitelisting functionality for DryDock
Reasoning: Need a mechanism to allow known/acceptable duplicated code to be bypassed. A simple line-by-line hash whitelisting file handles false positives at the root hash level.
Constraint: Ensure whitelisting logic is separate from core tokenisation to avoid bloating.

## 2026-03-01 - [Historical Analysis (Trend)]
Decision: Isolate trend calculation into a pure function `analyzeTrend` in `src/trend.ts` instead of directly baking it into the core `DryDockReport` type or scanner logic.
Reasoning: We want the scanner to remain focused on the current state. The trend is derived purely by comparing two valid states (reports). This makes testing trivial and keeps core scanning performant.
Constraint: Keep CLI formatting separate from `analyzeTrend` so it can be re-used later for dashboard visualisations.

## 2026-03-01 - [Dashboard Trend Visualisation]
Decision: Implement trend data API (`/api/trend`) and basic HTML/CSS visualization directly within the existing dashboard string.
Reasoning: We needed a way to present historical changes visually without bloating the app with heavy graphing dependencies (like Chart.js). Fetching trend data natively allows graceful fallback if `--compare` is not used.
Constraint: Ensure `TrendResult` is safely handled on the client side if the API endpoint returns 404 or null when no previous report is compared against.

## 2026-03-02 - [Dashboard API Tests]
Decision: Provide baseline `--compare` flag with a mock/old report during dashboard e2e or unit tests.
Reasoning: We needed to verify that the `/api/trend` returns a valid payload structure when trend data is actually present, which is only possible if `--compare` is used to load an `oldReport`.
Constraint: Do not rely on server implicit behaviour; make test environment configurations explicit so the server handles endpoints as it would in production with the expected flags.
