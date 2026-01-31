# DryDock

DryDock is a utility for detecting code duplication across repositories.

## Verifying the Installation

To verify DryDock is correctly identifying cross-project leakage:

1. **Create a test folder:** `mkdir test-drydock && cd test-drydock`
2. **Setup mock projects:** - Create `app-1/main.js` and `app-2/main.js`.
   - Paste the same 50+ line function into both.
3. **Run the check:**
   ```bash
   drydock scan ./app-1 ./app-2 --open
   ```
4. **Validation:** You should see a "Cross-Project" badge in the dashboard with a high RefactorScore, indicating a "Library Candidate."

## Dashboard Results

Here is an example of the DryDock dashboard visualizing the cross-project leakage between two mock applications:

![DryDock Dashboard](drydock-dashboard.png)

The dashboard highlights:
- A high **RefactorScore** for the duplicated `duplicate()` function.
- A **Leakage Matrix** showing the connection between `app-1` and `app-2`.
