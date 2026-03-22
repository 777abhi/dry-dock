# DryDock: Exploratory Testing Guide

Welcome to the DryDock exploratory testing guide! This document is designed to help you, as a manual tester, quickly get up to speed with evaluating DryDock's core features. DryDock is a powerful utility designed to detect structural code duplication—both within a single project and across multiple repositories.

Your mission is to explore the "Happy Paths" and intentionally push the tool to see how it handles edge cases, false positives, and varied reporting formats.

---

## Prerequisites & Setup

Before we begin testing, ensure your local environment is prepared.

1. **Environment:** Ensure you have Node.js (version 18+) and `npm` installed.
2. **Access:** You must have the `dry-dock` repository cloned locally.
3. **Open a Terminal:** Navigate to the root directory of the `dry-dock` repository.
4. **Install Dependencies:**
   **Run the command:** `npm install`
5. **Generate Test Data:** We provide a script to instantly generate mock projects containing deliberate cross-project and internal duplication.
   **Run the command:** `./setup_samples.sh`
   *(This creates a `sample-projects` folder containing `project-a`, `project-b`, and `project-c`.)*

---

## Test Scenario 1: Basic Scanning & The Interactive Dashboard

This scenario tests the core value proposition: identifying leaks and visualizing them in the dashboard.

1. **Start the Scan:** In your terminal, initiate a scan across the newly generated sample projects and instruct DryDock to open the dashboard automatically.
   **Run the command:** `npm start -- scan sample-projects/* --open`
2. **Verify CLI Output:** The terminal should output a summary of the projects found and confirm the dashboard server has started on a local port (usually `http://localhost:3000`).
3. **Explore the Dashboard:** Your default web browser should open automatically.
   *   **Verify the 'Project Leakage Matrix':** You should see a table visualizing connections between `project-a`, `project-b`, and `project-c`. Cells highlighting duplication should be visible (e.g., between `project-a` and `project-b`).
   *   **Verify 'Cross-Project Leakage':** Scroll down to view the prioritized list of cross-project duplicates. Note the **RefactorScore**—this metric prioritizes leaks based on spread, frequency, and lines of code.

>[Screenshot Placeholder: Main Dashboard view. Capture the "Project Leakage Matrix" table and the first "Cross-Project Leakage" item showing the RefactorScore.]

**Pro-Tip:** The RefactorScore is the primary metric for prioritizing technical debt. The higher the score, the more critical the duplication. The `--fail` flag can be appended to the command (`npm start -- scan ... --fail`) to force the CLI to exit with an error code if *any* cross-project leakage is found (useful for CI/CD testing).

---

## Test Scenario 2: Deep Dive with the Code Inspector

DryDock normalizes code (ignoring whitespace, comments, and variable names) to find *structural* clones, not just exact textual matches. Let's verify this.

1. **Locate a Leak:** In the dashboard (from Scenario 1), find a Cross-Project Leakage item.
2. **Open Inspector:** **Click the blue 'Inspect Code' button** next to that item.
3. **Verify Side-by-Side View:** A modal window should appear, displaying the source code from two different files side-by-side.
4. **Analyze Differences:** Observe that while the code structure is identical (e.g., the flow of `if` statements and loops), the specific variable names, class names, or comments might differ slightly between the two files. (The `setup_samples.sh` script specifically alters class names between `project-a` and `project-b` to test this).

>[Screenshot Placeholder: Clone Inspector Modal. Capture the side-by-side view showing two structurally similar but textually different code blocks.]

**Pro-Tip:** The inspector is crucial for validating whether a reported leak is genuinely identical logic or just similar boilerplate. Look for the "Cyclomatic Complexity" metrics if available in the view to gauge the complexity of the duplicated logic.

---

## Test Scenario 3: Whitelisting False Positives

Sometimes, identical boilerplate is unavoidable or accepted. DryDock allows users to ignore specific hashes.

1. **Identify a Hash:** In the dashboard, locate an item you want to ignore (perhaps an 'Internal Duplicate'). Copy the **Hash** value displayed above the file paths (e.g., `Hash: e931881c...`).
2. **Create a Whitelist:** In your terminal, at the root of the repository, create a new file named `.drydockwhitelist`.
3. **Add the Hash:** Open `.drydockwhitelist` in a text editor and paste the copied hash onto a new line. Save the file.
4. **Rerun the Scan:** **Run the command:** `npm start -- scan sample-projects/* --open`
5. **Verify Exclusion:** Refresh the dashboard. Verify that the specific leakage item associated with that hash is no longer reported in the results.

**Pro-Tip:** You can add comments to the `.drydockwhitelist` file by starting a line with `#`. This is highly recommended to explain *why* a hash was whitelisted (e.g., `# Ignore standard Express boilerplate`).

---

## Test Scenario 4: Exporting Reports

DryDock supports various output formats for integration with other tools or executive reporting.

1. **Run Multi-Format Scan:** In your terminal, execute a scan requesting multiple output formats.
   **Run the command:** `npm start -- scan sample-projects/* --formats json,csv,html,mermaid`
2. **Verify File Creation:** Check the root directory of the repository. You should see several new files generated:
   *   `drydock-report.json`
   *   `drydock-report.csv`
   *   `drydock-report.html`
   *   `drydock-report.mmd` (Mermaid graph)
3. **Inspect Output:** Open `drydock-report.csv` in a spreadsheet application or text editor to verify the data structure is tabular and understandable. Open the `drydock-report.html` file in a browser to see the static HTML version of the report.

**Pro-Tip:** PDF export is also supported (`--formats pdf`). Generating a PDF is excellent for sending point-in-time reports directly to stakeholders without requiring them to access the dashboard.

---

## Troubleshooting & Common Errors

If you encounter issues during your exploration, check these common scenarios:

*   **Error: "No project root found" / Empty Results:**
    *   *Cause:* DryDock identifies project boundaries by looking for `package.json`, `go.mod`, or `.git` directories. If the paths you provided don't contain these files upstream, it won't recognize them as distinct projects.
    *   *Fix:* Ensure you ran `./setup_samples.sh` correctly, and that you are pointing the scanner at directories that contain a `package.json` file.
*   **Error: "Port already in use" (when using `--open`):**
    *   *Cause:* Another instance of the DryDock dashboard or another application is currently using the requested port (usually 3000).
    *   *Fix:* Close the existing terminal running DryDock, or find and kill the process using port 3000. DryDock does attempt to use random ports if 3000 is occupied, but conflicts can still happen.
*   **Missing TypeScript Errors (`Cannot find module...`):**
    *   *Cause:* The environment isn't properly set up to execute TypeScript files directly.
    *   *Fix:* Ensure you are using `npm start -- ...` (which utilizes `ts-node` internally) rather than trying to run `node src/drydock.ts` directly.
*   **No "Cross-Project" leaks found, only "Internal":**
    *   *Cause:* You might be scanning only a single project directory, or the structural clones are completely contained within one project boundary.
    *   *Fix:* Ensure you are passing multiple distinct project directories to the `scan` command, e.g., `scan dir1/ dir2/`.