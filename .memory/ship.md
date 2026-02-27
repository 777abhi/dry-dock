## 2026-02-27 - [Whitelisting]
Decision: Implement Whitelisting functionality for DryDock
Reasoning: Need a mechanism to allow known/acceptable duplicated code to be bypassed. A simple line-by-line hash whitelisting file handles false positives at the root hash level.
Constraint: Ensure whitelisting logic is separate from core tokenisation to avoid bloating.
