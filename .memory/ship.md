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

## 2026-03-07 - [Language Agnostic Extensions]
Decision: Introduce a singleton `LanguageRegistry` to handle file extension to tokenizer format mapping dynamically.
Reasoning: The hardcoded map inside the scanner made it impossible to support new or proprietary languages without modifying the core codebase. The registry allows runtime extension via CLI, making the tool truly language agnostic.
Constraint: Ensure the CLI correctly ignores malformed `--language` flag inputs and safely defaults to 'javascript' to prevent scan failures.

## 2026-03-08 - [Cyclomatic Complexity Integration]
Decision: Introduce Cyclomatic Complexity calculation within `scanFile` and propagate it to `DryDockReport` and Dashboard UI.
Reasoning: By observing branching keywords and operators directly via token stream parsing (`@jscpd/tokenizer`), we can calculate complexity and augment clone reports to guide deeper refactoring, providing another useful metric alongside lines and frequency.
Constraint: Complexity is computed strictly on a per-file basis during token traversal to ensure minimal performance overhead.

## 2026-03-09 - [Real-time Code Quality Telemetry]
Decision: Implement TelemetryExporter and transition monolithic `http.createServer` if/else logic into a mapped `routes` dictionary.
Reasoning: To support observability (#28), a `/metrics` endpoint serving Prometheus text format was needed. Adding this exposed the fragility and unmaintainability of the existing server routing. Evolving to a dictionary-based route handler elegantly decouples endpoints, obeying Open/Closed principles for future API additions.
Constraint: Ensure all existing dashboard endpoints (like `/api/diff` and `/api/code`) map correctly to the new `RouteHandler` signature, which now explicitly parses and provides `url.URL`.

## 2026-03-10 - [REST API Mode]
Decision: Implement `--api-only` flag and inject fully permissive CORS headers into the HTTP server response lifecycle.
Reasoning: To support external tool integration as per roadmap feature #18, the dashboard server needed to be able to run silently (without an initial scan or opening the dashboard) and handle cross-origin requests. Adding CORS headers centrally in the server handler avoids repetition.
Constraint: All new endpoints must pass through the main request handler to receive CORS headers automatically.

## 2026-03-11 - [Parallel Processing]
Decision: Implement Multi-threaded scanning using Node.js `worker_threads` and a chunking mechanism.
Reasoning: To fulfill roadmap feature #10 "Multi-threaded scanning for large repositories to improve performance." Offloading CPU-bound tasks (tokenisation and hashing) to worker threads significantly reduces execution time on large codebases.
Constraint: Ensure the worker initialization correctly passes TS-Node execution arguments (`execArgv`) when running in development environments, and robustly handles un-compileable file paths to avoid silent thread failures.

## 2026-03-12 - [Advanced Webhooks]
Decision: Implement Advanced Webhooks (#31) and refactor the HTTP request logic in `src/notifier.ts` to be reusable.
Reasoning: To support per-project subscription webhooks to notify distinct teams of leakage specifically impacting their codebases.
Constraint: Ensure that notifications are only sent to specific project webhooks if there's actual leakage for that project.

## 2026-03-13 - [GraphQL API Integration]
Decision: Integrate a `/api/graphql` endpoint alongside the existing REST API to support fine-grained querying.
Reasoning: Exposing DryDock metrics via a GraphQL API allows external services to perform complex queries to retrieve exactly the data they need, satisfying roadmap feature #32. We used `graphql` natively to map our strongly typed structures.
Constraint: Ensure the GraphQL schema directly maps onto existing `DryDockReport` types to avoid redundant type declaration logic.

## 2026-03-14 - [Monorepo Support]
Decision: Refactor `project-identifier.ts` to use a Strategy Pattern (`IProjectIdentifierStrategy`).
Reasoning: The legacy implementation relied solely on the names of directories that contained `package.json` or `go.mod` files. In monorepos, this frequently resulted in collisions (e.g. `packages/api` vs `apps/api`), undermining the `RefactorScore` calculation. The Strategy Pattern decouples identification logic per package manager, making it trivial to extract explicit names.
Constraint: Ensure file reading errors (e.g., malformed `package.json`) are caught cleanly so it can silently fall back to directory naming without crashing the scanner thread.
\n## 2026-03-15 - [Graph Visualization]\nDecision: Integrated a Mermaid-based Dependency Graph generation feature into DryDock.\nReasoning: We needed to fulfill roadmap feature #15 to visualize the dependency relationships between projects based on leaks. This is more intuitive than a simple leakage list or matrix.\nConstraint: Ensure the graph generation avoids duplicate edges for reciprocal relationships and cleanly sanitizes project names for valid Mermaid syntax.\n
