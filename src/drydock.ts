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
import { exportToCSV, exportToJUnit, exportToHTML, exportToMermaid } from './reporter';
import { analyzeTrend, TrendResult } from './trend';
import { WebhookNotifier, ProjectWebhookNotifier } from './notifier';
import { DiffService } from './diff-viewer';
import { LanguageRegistry } from './language-registry';
import { TelemetryExporter } from './telemetry';
import { executeGraphQL } from './graphql';
import { Worker } from 'worker_threads';
import * as os from 'os';

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
            <!-- Trend Analysis Section -->
            <div id="trend-section" class="bg-white rounded-lg shadow p-6 hidden">
                <h2 class="text-xl font-bold mb-4 text-gray-800">Trend Analysis</h2>
                <div id="trend-container" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <!-- Trend metrics will be rendered here -->
                </div>
            </div>

             <!-- Leakage Matrix -->
            <div class="bg-white rounded-lg shadow p-6 overflow-x-auto">
                <h2 class="text-xl font-bold mb-4 text-gray-800">Project Leakage Matrix</h2>
                <div id="matrix-container">
                    <!-- Matrix will be rendered here -->
                </div>

                <h2 class="text-xl font-bold mt-8 mb-4 text-gray-800">Dependency Graph</h2>
                <div id="graph-container" class="w-full flex justify-center mt-4">
                    <!-- Graph will be rendered here -->
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

    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true });

        // Attach functions to window so they can be called from HTML onclick attributes
        window.browseFolder = browseFolder;
        window.triggerScan = triggerScan;
        window.cancelScan = cancelScan;
        window.inspectClone = inspectClone;
        window.closeInspector = closeInspector;

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
                const [reportResponse, trendResponse] = await Promise.all([
                    fetch('/api/data'),
                    fetch('/api/trend').then(res => res.ok ? res.json() : null).catch(() => null)
                ]);
                const report = await reportResponse.json();
                const trend = trendResponse;

                if (report && (report.cross_project_leakage.length > 0 || report.internal_duplicates.length > 0)) {
                   renderReport(report, trend);
                }
            } catch (error) {
                console.log('No existing report data found.', error);
            }
        }

        async function renderReport(report, trend = null) {
            reportData = report;
            document.getElementById('results-container').classList.remove('hidden');
            document.getElementById('empty-state').classList.add('hidden');
            
            renderStats(report);
            await renderMatrix(report);
            renderLeakage(report);
            if (trend && trend.scoreChange !== undefined) {
                renderTrend(trend);
            }
        }

        function renderTrend(trend) {
            document.getElementById('trend-section').classList.remove('hidden');
            const container = document.getElementById('trend-container');
            const scoreColor = trend.scoreChange > 0 ? 'text-red-600' : (trend.scoreChange < 0 ? 'text-green-600' : 'text-gray-600');
            const scoreSign = trend.scoreChange > 0 ? '+' : '';

            container.innerHTML = \`
                <div class="p-4 bg-gray-50 rounded border text-center">
                    <div class="text-sm text-gray-500 uppercase tracking-wide">New Leaks</div>
                    <div class="text-2xl font-bold text-red-600">\${trend.newLeaks.length}</div>
                </div>
                <div class="p-4 bg-gray-50 rounded border text-center">
                    <div class="text-sm text-gray-500 uppercase tracking-wide">Resolved Leaks</div>
                    <div class="text-2xl font-bold text-green-600">\${trend.resolvedLeaks.length}</div>
                </div>
                <div class="p-4 bg-gray-50 rounded border text-center">
                    <div class="text-sm text-gray-500 uppercase tracking-wide">Remaining Leaks</div>
                    <div class="text-2xl font-bold text-yellow-600">\${trend.remainingLeaks.length}</div>
                </div>
                <div class="p-4 bg-gray-50 rounded border text-center">
                    <div class="text-sm text-gray-500 uppercase tracking-wide">Score Change</div>
                    <div class="text-2xl font-bold \${scoreColor}">\${scoreSign}\${Math.round(trend.scoreChange)}</div>
                </div>
            \`;
        }

        function renderStats(report) {
            const crossCount = report.cross_project_leakage.length;
            const internalCount = report.internal_duplicates.length;
            document.getElementById('stats').innerText =
                \`Found \${crossCount} cross-project leaks & \${internalCount} internal duplicates\`;
        }

        async function renderMatrix(report) {
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

            // Render Mermaid Graph
            if (report.cross_project_leakage.length > 0) {
                const nodes = new Set();
                const edges = new Map();

                const sanitizeId = (name) => name.replace(/[^a-zA-Z0-9]/g, '_');

                report.cross_project_leakage.forEach(leak => {
                    for (let i = 0; i < leak.projects.length; i++) {
                        for (let j = i + 1; j < leak.projects.length; j++) {
                            const p1 = leak.projects[i];
                            const p2 = leak.projects[j];

                            nodes.add(p1);
                            nodes.add(p2);

                            const sourceId = sanitizeId(p1);
                            const targetId = sanitizeId(p2);

                            const [a, b] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];

                            const edgeKey = \`\${a}:::\${b}\`;
                            const currentWeight = edges.get(edgeKey) || 0;
                            edges.set(edgeKey, currentWeight + leak.lines);
                        }
                    }
                });

                let mermaidDef = 'graph TD\\n';
                nodes.forEach(project => {
                    mermaidDef += \`    \${sanitizeId(project)}["\${project}"]\\n\`;
                });
                edges.forEach((weight, edgeKey) => {
                    const [source, target] = edgeKey.split(':::');
                    mermaidDef += \`    \${source} -->|\${weight} lines| \${target}\\n\`;
                });

                const graphContainer = document.getElementById('graph-container');

                // Clear the container first in case of re-render
                graphContainer.innerHTML = '';

                // create a pre element with the mermaid class
                const graphEl = document.createElement('pre');
                graphEl.className = 'mermaid text-sm';
                graphEl.textContent = mermaidDef;

                graphContainer.appendChild(graphEl);

                try {
                    await mermaid.run({
                        nodes: [graphEl]
                    });
                } catch (e) {
                    console.error('Mermaid rendering failed', e);
                }
            } else {
                document.getElementById('graph-container').innerHTML = '<p class="text-gray-500 italic">No cross-project dependencies to map.</p>';
            }
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
                             Complexity: <span class="font-bold text-yellow-600">\${item.complexity}</span> | Found in: \${item.occurrences.map(o => {
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

             const file1 = occ1.file || occ1;
             const file2 = occ2.file || occ2;
             const proj1 = occ1.project || item.project;
             const proj2 = occ2.project || item.project;

             try {
                 const diffResponse = await fetch('\/api\/diff?file1=' + encodeURIComponent(file1) + '&file2=' + encodeURIComponent(file2));
                 const diff = await diffResponse.json();

                 let formattedCode1 = '';
                 let formattedCode2 = '';

                 diff.forEach(part => {
                     const color = part.added ? 'bg-green-100 text-green-800' :
                                   part.removed ? 'bg-red-100 text-red-800' : 'text-gray-800';
                     const escapedValue = escapeHtml(part.value);

                     if (part.added) {
                         formattedCode2 += '\<span class="' + color + '"\>' + escapedValue + '\<\/span\>';
                     } else if (part.removed) {
                         formattedCode1 += '\<span class="' + color + '"\>' + escapedValue + '\<\/span\>';
                     } else {
                         formattedCode1 += '\<span class="' + color + '"\>' + escapedValue + '\<\/span\>';
                         formattedCode2 += '\<span class="' + color + '"\>' + escapedValue + '\<\/span\>';
                     }
                 });

                 content.innerHTML = \`
                    <div class="flex flex-col h-full overflow-hidden border rounded">
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${escapeHtml(file1)} (\${escapeHtml(proj1)})</div>
                        <pre class="flex-1 overflow-auto p-4 text-xs bg-gray-50 whitespace-pre-wrap"><code>\${formattedCode1}</code></pre>
                    </div>
                    <div class="flex flex-col h-full overflow-hidden border rounded">
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${escapeHtml(file2)} (\${escapeHtml(proj2)})</div>
                        <pre class="flex-1 overflow-auto p-4 text-xs bg-gray-50 whitespace-pre-wrap"><code>\${formattedCode2}</code></pre>
                    </div>
                 \`;
             } catch (e) {
                 content.innerHTML = '<div class="col-span-2 text-red-600">Error loading diff.</div>';
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
             try {
                 const [response, trendResponse] = await Promise.all([
                     fetch('/api/data'),
                     fetch('/api/trend').then(res => res.ok ? res.json() : null).catch(() => null)
                 ]);
                 reportData = await response.json();
                 const trendData = trendResponse;

                 // Hide trend section if there's no trend data (e.g. after a new scan)
                 if (!trendData) {
                     document.getElementById('trend-section').classList.add('hidden');
                 }

                 if (reportData && (reportData.cross_project_leakage.length > 0 || reportData.internal_duplicates.length > 0)) {
                     await renderReport(reportData, trendData);
                 }
             } catch (error) {
                 console.error('Failed to load updated report data', error);
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
    whitelist?: string[];
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

    const index = new Map<string, { occurrences: Occurrence[], lines: number, complexity: number }>();
    const allProjects = new Set<string>();

    let processed = 0;

    // Filter out non-files first
    const validFiles = files.filter(file => fs.statSync(file).isFile());

    const numWorkers = Math.max(1, os.cpus().length - 1);
    const chunkSize = Math.ceil(validFiles.length / numWorkers);
    const chunks: string[][] = [];

    for (let i = 0; i < validFiles.length; i += chunkSize) {
        chunks.push(validFiles.slice(i, i + chunkSize));
    }

    const workerPromises = chunks.map(chunk => {
        return new Promise<void>((resolve, reject) => {
            if (shouldCancel) {
                return reject(new Error('Scan cancelled'));
            }
            const ext = path.extname(__filename);
            const workerPath = path.join(__dirname, `scanner-worker${ext}`);
            const isTsNode = process.execArgv.join('').includes('ts-node') || ext === '.ts';

            const workerOptions: any = {
                workerData: { files: chunk }
            };

            if (isTsNode && workerPath.endsWith('.ts')) {
                workerOptions.execArgv = ['-r', 'ts-node/register'];
            }

            const worker = new Worker(workerPath, workerOptions);

            worker.on('message', (item: any) => {
                processed++;
                if (processed % 100 === 0) {
                    console.log(`Processed ${processed}/${validFiles.length} files...`);
                }

                if (item.error) {
                    console.warn(`Error scanning ${item.file}:`, item.error);
                    return;
                }

                const result = item.result;
                if (result) {
                    if (result.lines < options.minLines) return;
                    if (options.whitelist && options.whitelist.includes(result.hash)) return;

                    allProjects.add(result.project);
                    if (!index.has(result.hash)) {
                        index.set(result.hash, { occurrences: [], lines: result.lines, complexity: result.complexity });
                    }
                    index.get(result.hash)!.occurrences.push({
                        project: result.project,
                        file: path.relative(process.cwd(), item.file)
                    });
                }
            });
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
                else resolve();
            });
        });
    });

    try {
        await Promise.all(workerPromises);
    } catch (e: any) {
        if (e.message === 'Scan cancelled') {
            console.log('Scan cancelled by user.');
            throw e;
        }
        console.error('Worker execution failed:', e);
        throw e;
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
        const complexity = data.complexity;
        // RefactorScore = P (Spread)^1.5 * F (Frequency) * L (Lines)
        const score = Math.pow(spread, 1.5) * frequency * lines;

        if (spread > 1) {
            cross_project_leakage.push({
                hash,
                lines,
                complexity,
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
                complexity,
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
let currentTrendData: TrendResult | null = null;
let currentCliOptions: ScanOptions = { minLines: 0, ignorePatterns: [], whitelist: [] };

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

    // Parse language extensions dynamically
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--language' && i + 1 < args.length) {
            const langArg = args[i + 1];
            const parts = langArg.split('=');
            if (parts.length === 2) {
                LanguageRegistry.getInstance().registerExtension(parts[0], parts[1]);
            } else {
                console.warn(`Invalid format for --language flag: ${langArg}. Expected format: .ext=format`);
            }
            // Skip the next argument
            i++;
        }
    }

    // Parse formats
    const formatIndex = args.indexOf('--formats');
    let formats = ['json'];
    if (formatIndex !== -1 && args[formatIndex + 1]) {
        formats = args[formatIndex + 1].split(',').map(f => f.trim().toLowerCase());
    }

    // Parse whitelist
    const whitelistIndex = args.indexOf('--whitelist');
    let whitelistFile = '.drydockwhitelist';

    // Parse compare
    const compareIndex = args.indexOf('--compare');
    let comparePath: string | null = null;
    if (compareIndex !== -1 && args[compareIndex + 1]) {
        comparePath = args[compareIndex + 1];
    }

    // Parse webhook
    const webhookIndex = args.indexOf('--webhook');
    let webhookUrl: string | null = null;
    if (webhookIndex !== -1 && args[webhookIndex + 1]) {
        webhookUrl = args[webhookIndex + 1];
    }

    // Parse project webhooks
    const projectWebhooksIndex = args.indexOf('--project-webhooks');
    let projectWebhooksFile: string | null = null;
    if (projectWebhooksIndex !== -1 && args[projectWebhooksIndex + 1]) {
        projectWebhooksFile = args[projectWebhooksIndex + 1];
    }

    if (whitelistIndex !== -1 && args[whitelistIndex + 1]) {
        whitelistFile = args[whitelistIndex + 1];
    }

    let whitelist: string[] = [];
    const whitelistPath = path.resolve(process.cwd(), whitelistFile);
    if (fs.existsSync(whitelistPath)) {
        try {
            const content = fs.readFileSync(whitelistPath, 'utf-8');
            whitelist = content.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
            console.log(`Loaded ${whitelist.length} whitelist entries from ${whitelistFile}`);
        } catch (err) {
            console.warn(`Failed to read whitelist file ${whitelistFile}:`, err);
        }
    }

    const failOnLeaks = args.includes('--fail');
    const shouldOpen = args.includes('--open') || args.length === 0;
    const isApiOnly = args.includes('--api-only');

    // Collect paths to scan
    const scanArgs = args.filter((arg, index) => {
        if (arg.startsWith('--')) return false;
        if (index > 0 && args[index - 1].startsWith('--')) return false;
        return true;
    });

    currentCliOptions = {
        minLines,
        ignorePatterns: [...getIgnorePatterns(), ...cliIgnore],
        whitelist
    };

    // If paths provided, run immediate scan
    if (scanArgs.length > 0 && !isApiOnly) {
        console.log('Scanning paths:', scanArgs);
        try {
            currentReport = await executeScan(scanArgs, currentCliOptions);

            // Save reports based on formats
            for (const format of formats) {
                switch (format) {
                    case 'json':
                        fs.writeFileSync('drydock-report.json', JSON.stringify(currentReport, null, 2));
                        console.log('Report saved to drydock-report.json');
                        break;
                    case 'csv':
                        fs.writeFileSync('drydock-report.csv', exportToCSV(currentReport));
                        console.log('Report saved to drydock-report.csv');
                        break;
                    case 'junit':
                        fs.writeFileSync('drydock-report.xml', exportToJUnit(currentReport));
                        console.log('Report saved to drydock-report.xml');
                        break;
                    case 'html':
                        fs.writeFileSync('drydock-report.html', exportToHTML(currentReport, DASHBOARD_HTML));
                        console.log('Report saved to drydock-report.html');
                        break;
                    case 'mermaid':
                        fs.writeFileSync('drydock-report.mmd', exportToMermaid(currentReport));
                        console.log('Report saved to drydock-report.mmd');
                        break;
                    default:
                        console.warn(`Unknown format: ${format}`);
                }
            }

            if (webhookUrl) {
                console.log(`Sending webhook notification to ${webhookUrl}...`);
                const notifier = new WebhookNotifier(webhookUrl);
                try {
                    await notifier.notify(currentReport);
                    console.log('Webhook notification sent successfully.');
                } catch (err: any) {
                    console.error('Failed to send webhook notification:', err.message);
                }
            }

            if (projectWebhooksFile) {
                const projectWebhooksPath = path.resolve(process.cwd(), projectWebhooksFile);
                if (fs.existsSync(projectWebhooksPath)) {
                    try {
                        const content = fs.readFileSync(projectWebhooksPath, 'utf-8');
                        const projectWebhooksMap = JSON.parse(content);
                        console.log(`Sending project-specific webhook notifications...`);
                        const projectNotifier = new ProjectWebhookNotifier(projectWebhooksMap);
                        await projectNotifier.notify(currentReport);
                        console.log('Project-specific webhook notifications sent successfully.');
                    } catch (err: any) {
                        console.error('Failed to parse or send project webhooks:', err.message);
                    }
                } else {
                    console.warn(`Project webhooks file not found at: ${projectWebhooksPath}`);
                }
            }

            if (comparePath) {
                if (fs.existsSync(comparePath)) {
                    console.log(`\nComparing against previous report: ${comparePath}`);
                    const oldReportRaw = fs.readFileSync(comparePath, 'utf-8');
                    try {
                        const oldReport: DryDockReport = JSON.parse(oldReportRaw);
                        const trend: TrendResult = analyzeTrend(oldReport, currentReport);
                        currentTrendData = trend;
                        console.log('--- Trend Analysis ---');
                        console.log(`New leaks introduced: ${trend.newLeaks.length}`);
                        console.log(`Leaks resolved: ${trend.resolvedLeaks.length}`);
                        console.log(`Leaks remaining: ${trend.remainingLeaks.length}`);
                        console.log(`Total RefactorScore change: ${trend.scoreChange > 0 ? '+' : ''}${Math.round(trend.scoreChange)}`);
                        console.log('----------------------\n');
                    } catch (err) {
                        console.warn('Failed to parse old report for comparison:', err);
                    }
                } else {
                    console.warn(`Comparison report not found at: ${comparePath}`);
                }
            }

            const crossCount = currentReport.cross_project_leakage.length;
            if (failOnLeaks && crossCount > 0) {
                console.error(`CI Failure: ${crossCount} cross-project leaks detected.`);
                process.exitCode = 1;
            }
        } catch (e) {
            console.error('Scan failed:', e);
            process.exit(1);
        }
    } else if (isApiOnly) {
        console.log('Launching in API-only mode (--api-only). Skipping initial scan.');
    } else {
        console.log('No paths provided. Launching in interactive mode.');
    }

    if (shouldOpen || scanArgs.length === 0 || isApiOnly) {
        const initialPort = process.env.PORT !== undefined ? parseInt(process.env.PORT, 10) : 3000;

        type RouteHandler = (req: http.IncomingMessage, res: http.ServerResponse, parsedUrl: url.URL) => Promise<void> | void;

        const setCorsHeaders = (res: http.ServerResponse) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        };

        const routes: Record<string, Record<string, RouteHandler>> = {
            'OPTIONS': {
                '*': (req, res) => {
                    setCorsHeaders(res);
                    res.writeHead(204);
                    res.end();
                }
            },
            'GET': {
                '/': (req, res) => {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(DASHBOARD_HTML);
                },
                '/api/data': (req, res) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(currentReport || { internal_duplicates: [], cross_project_leakage: [] }));
                },
                '/api/trend': (req, res) => {
                    if (currentTrendData) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(currentTrendData));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'No trend data available' }));
                    }
                },
                '/api/browse': (req, res) => {
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
                },
                '/api/diff': (req, res, parsedUrl) => {
                    let file1Param = parsedUrl.searchParams.get('file1');
                    let file2Param = parsedUrl.searchParams.get('file2');

                    if (!file1Param || typeof file1Param !== 'string' || !file2Param || typeof file2Param !== 'string') {
                        res.writeHead(400);
                        res.end('Missing or invalid file parameters');
                        return;
                    }

                    const filePath1 = path.resolve(process.cwd(), file1Param);
                    const relativePath1 = path.relative(process.cwd(), filePath1);
                    const filePath2 = path.resolve(process.cwd(), file2Param);
                    const relativePath2 = path.relative(process.cwd(), filePath2);

                    if (relativePath1.startsWith('..') || path.isAbsolute(relativePath1) ||
                        relativePath2.startsWith('..') || path.isAbsolute(relativePath2)) {
                        res.writeHead(403);
                        res.end('Access denied: File outside of project root');
                        return;
                    }

                    const isAllowed1 = currentReport && (
                        currentReport.internal_duplicates.some(d => d.occurrences.some((o: any) => o.file === relativePath1 || o === relativePath1)) ||
                        currentReport.cross_project_leakage.some(l => l.occurrences.some(o => o.file === relativePath1))
                    );

                    const isAllowed2 = currentReport && (
                        currentReport.internal_duplicates.some(d => d.occurrences.some((o: any) => o.file === relativePath2 || o === relativePath2)) ||
                        currentReport.cross_project_leakage.some(l => l.occurrences.some(o => o.file === relativePath2))
                    );

                    if (!isAllowed1 || !isAllowed2) {
                        res.writeHead(403);
                        res.end('Access denied: File not in report');
                        return;
                    }

                    if (!fs.existsSync(filePath1) || !fs.existsSync(filePath2)) {
                        res.writeHead(404);
                        res.end('File not found');
                        return;
                    }

                    try {
                        const code1 = fs.readFileSync(filePath1, 'utf-8');
                        const code2 = fs.readFileSync(filePath2, 'utf-8');
                        const diffService = new DiffService();
                        const diffResult = diffService.getDiff(code1, code2);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(diffResult));
                    } catch (err) {
                        res.writeHead(500);
                        res.end('Error calculating diff');
                    }
                },
                '/api/code': (req, res, parsedUrl) => {
                    let fileParam = parsedUrl.searchParams.get('file');

                    if (!fileParam || typeof fileParam !== 'string') {
                        res.writeHead(400);
                        res.end('Missing or invalid file parameter');
                        return;
                    }

                    const filePath = path.resolve(process.cwd(), fileParam);
                    const relativePath = path.relative(process.cwd(), filePath);

                    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                        res.writeHead(403);
                        res.end('Access denied: File outside of project root');
                        return;
                    }

                    const isAllowed = currentReport && (
                        currentReport.internal_duplicates.some(d => d.occurrences.some((o: any) => o.file === relativePath || o === relativePath)) ||
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
                },
                '/metrics': (req, res) => {
                    if (!currentReport) {
                        res.writeHead(404);
                        res.end('No report data available');
                        return;
                    }
                    const exporter = new TelemetryExporter();
                    const metrics = exporter.exportToPrometheus(currentReport);
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(metrics);
                }
            },
            'POST': {
                '/api/graphql': (req, res) => {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const payload = JSON.parse(body);
                            const query = payload.query;
                            const variables = payload.variables;

                            if (!query || typeof query !== 'string') {
                                res.writeHead(400);
                                res.end(JSON.stringify({ error: 'Missing or invalid query' }));
                                return;
                            }

                            const reportToQuery = currentReport || { internal_duplicates: [], cross_project_leakage: [] };
                            const result = await executeGraphQL(reportToQuery, query, variables);

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(result));
                        } catch (e: any) {
                            console.error('GraphQL API error:', e);
                            res.writeHead(400);
                            res.end(JSON.stringify({ error: 'Bad request or invalid GraphQL format' }));
                        }
                    });
                },
                '/api/scan': (req, res) => {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const { paths } = JSON.parse(body);
                            if (paths && Array.isArray(paths)) {
                                console.log('Triggering scan for:', paths);
                                currentTrendData = null; // Clear old trend data on fresh scan
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
                },
                '/api/cancel': (req, res) => {
                    shouldCancel = true;
                    res.writeHead(200);
                    res.end('Cancellation requested');
                }
            }
        };

        const server = http.createServer(async (req, res) => {
            const actualPort = (server.address() as any)?.port || initialPort;
            const parsedUrl = new URL(req.url || '', `http://localhost:${actualPort}`);
            const method = req.method || 'GET';
            const pathname = parsedUrl.pathname;

            setCorsHeaders(res);

            if (method === 'OPTIONS') {
                if (routes['OPTIONS'] && routes['OPTIONS']['*']) {
                    await routes['OPTIONS']['*'](req, res, parsedUrl);
                } else {
                    res.writeHead(204);
                    res.end();
                }
                return;
            }

            const methodRoutes = routes[method];
            if (methodRoutes && methodRoutes[pathname]) {
                await methodRoutes[pathname](req, res, parsedUrl);
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.on('error', (e: any) => {
            if (e.code === 'EADDRINUSE') {
                console.error(`Error: Port ${initialPort} is already in use.`);
                console.error(`Please stop the existing process running on port ${initialPort} or use a different port (e.g., set PORT env).`);
                process.exit(1);
            } else {
                console.error('Server error:', e);
                throw e;
            }
        });

        server.listen(initialPort, () => {
            const actualPort = (server.address() as any)?.port || initialPort;
            console.log(`Dashboard successfully launched at http://localhost:${actualPort}`);
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
