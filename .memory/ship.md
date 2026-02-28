## 2026-02-27 - [Whitelisting]
Decision: Implement Whitelisting functionality for DryDock
Reasoning: Need a mechanism to allow known/acceptable duplicated code to be bypassed. A simple line-by-line hash whitelisting file handles false positives at the root hash level.
Constraint: Ensure whitelisting logic is separate from core tokenisation to avoid bloating.

## 2026-03-01 - [Historical Analysis (Trend)]
Decision: Isolate trend calculation into a pure function `analyzeTrend` in `src/trend.ts` instead of directly baking it into the core `DryDockReport` type or scanner logic.
Reasoning: We want the scanner to remain focused on the current state. The trend is derived purely by comparing two valid states (reports). This makes testing trivial and keeps core scanning performant.
Constraint: Keep CLI formatting separate from `analyzeTrend` so it can be re-used later for dashboard visualisations.
