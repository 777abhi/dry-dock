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

## 2026-03-03 - [Server Test Reliability]
Decision: Update server startup sequence to natively handle `PORT=0` and allocate random ports, and reflect this dynamically in both logs and API test endpoints.
Reasoning: We needed to resolve port collisions when testing the interactive dashboard, especially in parallel test environments or when the local dev env is already using port 3000. Hardcoded test ports are brittle. Using `server.address().port` ensures tests target the correct live instance.
Constraint: When writing tests that extract data from process stdout streams, always ensure you buffer the stream chunks before regex matching to avoid issues where log lines are split across multiple buffer emissions.

## 2026-03-04 - [Slack/Teams Webhook Notifications]
Decision: Introduce a decoupled `WebhookNotifier` class and an `INotifier` interface.
Reasoning: To meet roadmap goals for CI/CD integrations, we need a flexible notification system. Decoupling notification logic via an interface ensures we can add email or other types of notifiers in the future without bloating core logic.
Constraint: Ensure the payload is formatted to be universally compatible with common webhook ingests (like Slack).

## 2026-03-05 - [Clone Diff View]
Decision: Add a diff viewer using the `diff` package to visualize how structural clones differ (e.g., changes in variable names or comments). Exposed via `/api/diff`.
Reasoning: Since DryDock detects structural clones and not just exact string matches, users need to clearly see *how* two clones differ textually in order to effectively consolidate them. Extracting this to `DiffService` keeps `src/drydock.ts` cleaner.
Constraint: Ensure directory traversal is prevented when fetching files for the diff.
