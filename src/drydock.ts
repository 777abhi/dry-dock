#!/usr/bin/env -S npx ts-node
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import fg from 'fast-glob';
import { scanFile } from './scanner';
import { getIgnorePatterns } from './utils';
import { getGitInfo } from './git-utils';
import { DryDockReport, InternalDuplicate, CrossProjectLeakage, Occurrence } from './types';
import { exportToCSV, exportToJUnit, exportToHTML } from './reporter';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>dry-dock Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-8">
    <div class="max-w-7xl mx-auto space-y-8">
        <header class="flex justify-between items-center">
            <h1 class="text-3xl font-bold text-gray-800">dry-dock Dashboard</h1>
            <div id="stats" class="text-gray-600"></div>
        </header>

         <!-- Setup / New Scan Section -->
        <div class="bg-white rounded-lg shadow p-6">
            <h2 class="text-xl font-bold mb-4 text-gray-800">New Scan</h2>
            <div class="flex gap-4 items-end">
                <div class="flex-1">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Repository Paths (comma separated)</label>
                    <input type="text" id="repo-paths" class="w-full border rounded px-3 py-2" placeholder="/path/to/repo1, /path/to/repo2">
                </div>
                <button id="browse-btn" onclick="browseFolder()" class="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded">Browse...</button>
                <button id="scan-btn" onclick="triggerScan()" class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold">Scan Now</button>
                <button id="cancel-btn" onclick="cancelScan()" class="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold hidden">Cancel</button>
            </div>
            <div id="scan-status" class="mt-2 text-sm text-gray-600"></div>
        </div>

        <div id="results-container" class="space-y-8 hidden">
             <!-- Leakage Matrix -->
            <div class="bg-white rounded-lg shadow p-6 overflow-x-auto">
                <h2 class="text-xl font-bold mb-4 text-gray-800">Project Leakage Matrix</h2>
                <div id="matrix-container">
                    <!-- Matrix will be rendered here -->
                </div>
            </div>

            <!-- Cross-Project Leakage List -->
            <div class="space-y-6">
                <h2 class="text-2xl font-bold text-red-600">Cross-Project Leakage</h2>
                <div id="leakage-list" class="grid gap-4">
                    <!-- Leakage items will be rendered here -->
                </div>
            </div>
        </div>
        
        <div id="empty-state" class="text-center py-12 text-gray-500">
            No scan results yet. Add paths above and click "Scan Now" to begin.
        </div>
    </div>

    <!-- Clone Inspector Modal -->
    <div id="inspector-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 hidden flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[80vh] flex flex-col">
            <div class="p-4 border-b flex justify-between items-center">
                <h3 class="text-xl font-bold">Clone Inspector</h3>
                <button onclick="closeInspector()" class="text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div class="flex-1 overflow-hidden p-4 grid grid-cols-2 gap-4" id="inspector-content">
                <!-- Code comparison will be injected here -->
            </div>
        </div>
    </div>

    <script>
        async function browseFolder() {
             try {
                 const response = await fetch('/api/browse');
                 if (response.ok) {
                     const path = await response.text();
                     if (path) {
                         const current = document.getElementById('repo-paths').value;
                         document.getElementById('repo-paths').value = current ? current + ', ' + path : path;
                     }
                 }
             } catch (e) {
                 console.error('Browse failed', e);
             }
        }

        async function triggerScan() {
            const paths = document.getElementById('repo-paths').value.split(',').map(p => p.trim()).filter(p => p);
            if (paths.length === 0) {
                alert('Please enter at least one path');
                return;
            }

            document.getElementById('scan-status').innerText = 'Scanning...';
            document.getElementById('scan-btn').classList.add('hidden');
            document.getElementById('cancel-btn').classList.remove('hidden');
            
            try {
                const response = await fetch('/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths })
                });
                
                if (response.ok) {
                    const report = await response.json();
                    renderReport(report);
                    document.getElementById('scan-status').innerText = 'Scan complete!';
                } else {
                     const err = await response.json();
                     if (err.error === 'Scan cancelled') {
                        document.getElementById('scan-status').innerText = 'Scan cancelled.';
                     } else {
                        document.getElementById('scan-status').innerText = 'Scan failed.';
                     }
                }
            } catch (e) {
                console.error(e);
                document.getElementById('scan-status').innerText = 'Error triggering scan.';
            } finally {
                document.getElementById('scan-btn').classList.remove('hidden');
                document.getElementById('cancel-btn').classList.add('hidden');
            }
        }

        async function cancelScan() {
             document.getElementById('scan-status').innerText = 'Cancelling...';
             await fetch('/api/cancel', { method: 'POST' });
        }

        async function loadData() {
            try {
                const response = await fetch('/api/data');
                const report = await response.json();
                if (report && (report.cross_project_leakage.length > 0 || report.internal_duplicates.length > 0)) {
                   renderReport(report);
                }
            } catch (error) {
                console.log('No existing report data found.');
            }
        }

        function renderReport(report) {
            reportData = report;
            document.getElementById('results-container').classList.remove('hidden');
            document.getElementById('empty-state').classList.add('hidden');
            
            renderStats(report);
            renderMatrix(report);
            renderLeakage(report);
        }

        function renderStats(report) {
            const crossCount = report.cross_project_leakage.length;
            const internalCount = report.internal_duplicates.length;
            document.getElementById('stats').innerText =
                \`Found \${crossCount} cross-project leaks & \${internalCount} internal duplicates\`;
        }

        function renderMatrix(report) {
            // Extract all unique projects from cross_project_leakage
            const projects = new Set();
            report.cross_project_leakage.forEach(item => {
                item.projects.forEach(p => projects.add(p));
            });
            const projectList = Array.from(projects).sort();

            // Calculate shared counts
            const matrix = {};
            projectList.forEach(p1 => {
                matrix[p1] = {};
                projectList.forEach(p2 => {
                    matrix[p1][p2] = 0;
                });
            });

            report.cross_project_leakage.forEach(item => {
                for (let i = 0; i < item.projects.length; i++) {
                    for (let j = i + 1; j < item.projects.length; j++) {
                        const p1 = item.projects[i];
                        const p2 = item.projects[j];
                        // Increment for both directions
                        if (matrix[p1] && matrix[p1][p2] !== undefined) matrix[p1][p2]++;
                        if (matrix[p2] && matrix[p2][p1] !== undefined) matrix[p2][p1]++;
                    }
                }
            });

            // Build Table
            let html = '<table class="min-w-full border-collapse"><thead><tr><th class="border p-2 bg-gray-50"></th>';
            projectList.forEach(p => {
                html += \`<th class="border p-2 bg-gray-50 font-semibold text-sm rotate-0">\${escapeHtml(p)}</th>\`;
            });
            html += '</tr></thead><tbody>';

            projectList.forEach(p1 => {
                html += \`<tr><td class="border p-2 font-semibold bg-gray-50 text-sm">\${escapeHtml(p1)}</td>\`;
                projectList.forEach(p2 => {
                    if (p1 === p2) {
                         html += '<td class="border p-2 text-center text-gray-300">-</td>';
                    } else {
                        const count = matrix[p1][p2];
                        const bgClass = count > 0 ? 'bg-red-100 text-red-800 font-bold' : 'bg-green-50 text-gray-400';
                        html += \`<td class="border p-2 text-center \${bgClass}">\${count}</td>\`;
                    }
                });
                html += '</tr>';
            });
            html += '</tbody></table>';

            document.getElementById('matrix-container').innerHTML = html;
        }

        function renderLeakage(report) {
            const list = document.getElementById('leakage-list');
            list.innerHTML = report.cross_project_leakage.map(item => \`
                <div class="p-4 border-l-4 border-red-500 bg-white shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div class="font-mono text-xs text-gray-500 mb-1">Hash: \${item.hash.slice(0, 8)}...</div>
                        <div class="text-lg font-semibold text-gray-900">
                            \${item.lines} lines shared across <span class="text-blue-600">\${item.projects.map(p => escapeHtml(p)).join(', ')}</span>
                        </div>
                        <div class="text-sm text-gray-600 mt-2">
                             Found in: \${item.occurrences.map(o => {
                                 const meta = o.author ? \` title="Last modified by \${escapeHtml(o.author)} on \${o.date}"\` : '';
                                 return \`<code class="bg-gray-100 px-1 py-0.5 rounded text-xs cursor-help"\${meta}>\${escapeHtml(o.file)}</code>\`;
                             }).join(', ')}
                        </div>
                    </div>
                    <div class="text-left md:text-right min-w-[150px]">
                        <div class="text-3xl font-bold text-blue-600">\${Math.round(item.score).toLocaleString()}</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">RefactorScore</div>
                        <div class="text-xs text-gray-500 mt-1">Spread: \${item.spread} | Freq: \${item.frequency}</div>
                        <button onclick="inspectClone('\${item.hash}')" class="mt-2 text-sm text-white bg-blue-600 px-3 py-1 rounded hover:bg-blue-700">Inspect Code</button>
                    </div>
                </div>
            \`).join('');
        }

        let reportData = null;

        async function inspectClone(hash) {
             const item = reportData.cross_project_leakage.find(i => i.hash === hash) || reportData.internal_duplicates.find(i => i.hash === hash);
             if (!item) return;

             const modal = document.getElementById('inspector-modal');
             const content = document.getElementById('inspector-content');
             modal.classList.remove('hidden');
             content.innerHTML = '<div class="col-span-2 text-center">Loading code...</div>';

             // Take top 2 occurrences for comparison
             const [occ1, occ2] = item.occurrences.slice(0, 2);

             try {
                 const [code1, code2] = await Promise.all([
                     fetch(\`/api/code?file=\${encodeURIComponent(occ1.file)}\`).then(r => r.text()),
                     fetch(\`/api/code?file=\${encodeURIComponent(occ2.file)}\`).then(r => r.text())
                 ]);

             content.innerHTML = \`
                    <div class="flex flex-col h-full overflow-hidden border rounded">
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${escapeHtml(occ1.file)} (\${escapeHtml(occ1.project)})</div>
                        <pre class="flex-1 overflow-auto p-4 text-xs bg-gray-50"><code>\${escapeHtml(code1)}</code></pre>
                    </div>
                    <div class="flex flex-col h-full overflow-hidden border rounded">
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${escapeHtml(occ2.file)} (\${escapeHtml(occ2.project)})</div>
                        <pre class="flex-1 overflow-auto p-4 text-xs bg-gray-50"><code>\${escapeHtml(code2)}</code></pre>
                    </div>
                 \`;
             } catch (e) {
                 content.innerHTML = '<div class="col-span-2 text-red-600">Error loading code.</div>';
             }
        }

        function closeInspector() {
            document.getElementById('inspector-modal').classList.add('hidden');
        }

        function escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // Hook loadData to save report
        const originalLoadData = loadData;
        loadData = async () => {
             const response = await fetch('/api/data');
             reportData = await response.json();
             if (reportData && (reportData.cross_project_leakage.length > 0 || reportData.internal_duplicates.length > 0)) {
                 renderReport(reportData);
             }
        };

        loadData();
    </script>
</body>
</html>`;

// ... imports
import { exec } from 'child_process';

interface ScanOptions {
    minLines: number;
    ignorePatterns: string[];
}

// Global cancellation state
let shouldCancel = false;

async function executeScan(paths: string[], options: ScanOptions): Promise<DryDockReport> {
    shouldCancel = false; // Reset cancel flag at start
    const entries: string[] = [];

    // Expand directories to globs
    const patterns = paths.map(arg => {
        if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
            return path.join(arg, '**', '*');
        }
        return arg;
    });

    const ignorePatterns = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/out/**',
        '**/client-build/**',
        '**/server-build/**',
        '**/.idea/**',
        '**/.vscode/**',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
        '**/*.svg',
        '**/*.ico',
        ...options.ignorePatterns
    ];

    console.log(`Starting file search in ${patterns.join(', ')}...`);
    const searchStart = Date.now();
    const files = await fg(patterns, {
        dot: false,
        ignore: ignorePatterns,
        absolute: true
    });
    console.log(`Found ${files.length} files in ${(Date.now() - searchStart) / 1000}s`);

    const index = new Map<string, { occurrences: Occurrence[], lines: number }>();
    const allProjects = new Set<string>();

    let processed = 0;
    for (const file of files) {
        if (shouldCancel) {
            console.log('Scan cancelled by user.');
            throw new Error('Scan cancelled');
        }

        // Only scan files
        if (!fs.statSync(file).isFile()) continue;

        processed++;
        if (processed % 100 === 0) {
            console.log(`Scanned ${processed}/${files.length} files...`);
        }

        try {
            const result = scanFile(file);
            if (result) {
                if (result.lines < options.minLines) continue;

                allProjects.add(result.project);
                if (!index.has(result.hash)) {
                    index.set(result.hash, { occurrences: [], lines: result.lines });
                }
                index.get(result.hash)!.occurrences.push({
                    project: result.project,
                    file: path.relative(process.cwd(), file)
                });
            }
        } catch (err) {
            console.warn(`Error scanning ${file}:`, err);
        }
    }

    console.log(`Found ${allProjects.size} project roots`);

    const internal_duplicates: InternalDuplicate[] = [];
    const cross_project_leakage: CrossProjectLeakage[] = [];

    for (const [hash, data] of index.entries()) {
        const frequency = data.occurrences.length;
        // Only report duplicates
        if (frequency <= 1) continue;

        // Enrich occurrences with git info now that we know they are duplicates
        const enrichedOccurrences = data.occurrences.map(occ => {
            const fullPath = path.resolve(process.cwd(), occ.file);
            const gitInfo = getGitInfo(fullPath);
            return {
                ...occ,
                ...(gitInfo && { author: gitInfo.author, date: gitInfo.date })
            };
        });

        const projects = Array.from(new Set(enrichedOccurrences.map(o => o.project)));
        const spread = projects.length;
        const lines = data.lines;
        // RefactorScore = P (Spread)^1.5 * F (Frequency) * L (Lines)
        const score = Math.pow(spread, 1.5) * frequency * lines;

        if (spread > 1) {
            cross_project_leakage.push({
                hash,
                lines,
                frequency,
                spread,
                score,
                projects,
                occurrences: enrichedOccurrences
            });
        } else {
            internal_duplicates.push({
                hash,
                lines,
                frequency,
                score,
                project: projects[0],
                occurrences: enrichedOccurrences.map(o => o.file)
            });
        }
    }

    return {
        internal_duplicates: internal_duplicates.sort((a, b) => b.score - a.score),
        cross_project_leakage: cross_project_leakage.sort((a, b) => b.score - a.score)
    };
}

let currentReport: DryDockReport | null = null;
let currentCliOptions: ScanOptions = { minLines: 0, ignorePatterns: [] };

async function main() {
    const args = process.argv.slice(2);

    // Parse args
    let minLines = 0;
    const minLinesIndex = args.indexOf('--min-lines');
    if (minLinesIndex !== -1 && args[minLinesIndex + 1]) {
        minLines = parseInt(args[minLinesIndex + 1], 10);
    }

    // Parse ignore options from cli if any (hacky, ideally use commander or similar)
    const ignoreIndex = args.indexOf('--ignore');
    let cliIgnore: string[] = [];
    if (ignoreIndex !== -1 && args[ignoreIndex + 1]) {
        cliIgnore = [args[ignoreIndex + 1]];
    }

    const failOnLeaks = args.includes('--fail');
    const shouldOpen = args.includes('--open') || args.length === 0;

    // Collect paths to scan
    const scanArgs = args.filter((arg, index) => {
        if (arg.startsWith('--')) return false;
        if (index > 0 && args[index - 1].startsWith('--')) return false;
        return true;
    });

    currentCliOptions = {
        minLines,
        ignorePatterns: [...getIgnorePatterns(), ...cliIgnore]
    };

    // If paths provided, run immediate scan
    if (scanArgs.length > 0) {
        console.log('Scanning paths:', scanArgs);
        try {
            currentReport = await executeScan(scanArgs, currentCliOptions);

            // Save reports based on formats (simplified for now to JSON default)
            // In a real refactor, format handling should be robust
            fs.writeFileSync('drydock-report.json', JSON.stringify(currentReport, null, 2));

            const crossCount = currentReport.cross_project_leakage.length;
            if (failOnLeaks && crossCount > 0) {
                console.error(`CI Failure: ${crossCount} cross-project leaks detected.`);
                process.exitCode = 1;
            }
        } catch (e) {
            console.error('Scan failed:', e);
            process.exit(1);
        }
    } else {
        console.log('No paths provided. Launching in interactive mode.');
    }

    if (shouldOpen || scanArgs.length === 0) {
        const server = http.createServer(async (req, res) => {
            // ... (keep existing request handling) ...
            const parsedUrl = new URL(req.url || '', 'http://localhost:3000');

            if (parsedUrl.pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(DASHBOARD_HTML);
            } else if (parsedUrl.pathname === '/api/data') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(currentReport || { internal_duplicates: [], cross_project_leakage: [] }));
            } else if (parsedUrl.pathname === '/api/scan' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const { paths } = JSON.parse(body);
                        if (paths && Array.isArray(paths)) {
                            console.log('Triggering scan for:', paths);
                            currentReport = await executeScan(paths, currentCliOptions);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(currentReport));
                        } else {
                            res.writeHead(400);
                            res.end('Invalid paths');
                        }
                    } catch (e: any) {
                        if (e.message === 'Scan cancelled') {
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: 'Scan cancelled' }));
                        } else {
                            console.error('Scan API error:', e);
                            res.writeHead(500);
                            res.end('Scan error');
                        }
                    }
                });
            } else if (parsedUrl.pathname === '/api/cancel' && req.method === 'POST') {
                shouldCancel = true;
                res.writeHead(200);
                res.end('Cancellation requested');
            } else if (parsedUrl.pathname === '/api/browse') {
                // macOS specific folder picker
                if (process.platform === 'darwin') {
                    exec(`osascript -e 'Tell application "System Events" to display dialog "Select a repository folder" default answer "" with icon note buttons {"Cancel", "Choose"} default button "Choose"' -e 'set the item_path to POSIX path of (choose folder with prompt "Select a repository folder")' -e 'return item_path'`, (err, stdout) => {
                        if (err) {
                            res.writeHead(500);
                            res.end('');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/plain' });
                            res.end(stdout.trim());
                        }
                    });
                } else {
                    res.writeHead(501);
                    res.end('Not supported on this OS');
                }
            } else if (parsedUrl.pathname === '/api/code') {
                let fileParam = parsedUrl.searchParams.get('file');

                if (!fileParam || typeof fileParam !== 'string') {
                    res.writeHead(400);
                    res.end('Missing or invalid file parameter');
                    return;
                }

                const filePath = path.resolve(process.cwd(), fileParam);
                const relativePath = path.relative(process.cwd(), filePath);

                // Security check: prevent directory traversal
                if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                    res.writeHead(403);
                    res.end('Access denied: File outside of project root');
                    return;
                }

                // Security check: prevent arbitrary file read (IDOR/LFI)
                // Only allow files that are part of the current report
                const isAllowed = currentReport && (
                    currentReport.internal_duplicates.some(d => d.occurrences.includes(relativePath)) ||
                    currentReport.cross_project_leakage.some(l => l.occurrences.some(o => o.file === relativePath))
                );

                if (!isAllowed) {
                    res.writeHead(403);
                    res.end('Access denied: File not in report');
                    return;
                }

                if (!fs.existsSync(filePath)) {
                    res.writeHead(404);
                    res.end('File not found');
                    return;
                }

                fs.readFile(filePath, 'utf-8', (err, data) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Error reading file');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/plain' });
                        res.end(data);
                    }
                });
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.on('error', (e: any) => {
            if (e.code === 'EADDRINUSE') {
                console.error('Error: Port 3000 is already in use.');
                console.error('Please stop the existing process running on port 3000 or use a different port.');
                process.exit(1);
            } else {
                console.error('Server error:', e);
                throw e;
            }
        });

        server.listen(3000, () => {
            console.log('Dashboard successfully launched at http://localhost:3000');
            console.log('Press Ctrl+C to stop the server.');
        });

        // Handle graceful shutdown
        const shutdown = () => {
            console.log('\nShutting down server...');
            server.close(() => {
                console.log('Server stopped.');
                process.exit(0);
            });
            // Force exit if server hasn't closed in 1s
            setTimeout(() => process.exit(0), 1000);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Keep process alive
        await new Promise(() => { });
    }
}

main();
