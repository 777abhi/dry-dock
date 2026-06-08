#!/usr/bin/env -S npx ts-node
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import fg from 'fast-glob';
import { scanFile } from './scanner';
import { getIgnorePatterns } from './utils';
import { getGitInfo, getGitInfoAsync } from './git-utils';
import { DryDockReport, InternalDuplicate, CrossProjectLeakage, Occurrence } from './types';
import { exportToCSV, exportToJUnit, exportToHTML, exportToMermaid, exportToPDF } from './reporter';
import { getCodeOwners } from './codeowners';
import { analyzeTrend, TrendResult } from './trend';
import { WebhookNotifier, ProjectWebhookNotifier, GitHubPRNotifier } from './notifier';
import { DiffService } from './diff-viewer';
import { LanguageRegistry } from './language-registry';
import { TelemetryExporter } from './telemetry';
import { executeGraphQL } from './graphql';
import { LibraryExtractor } from './library-extractor';
import { Worker } from 'worker_threads';
import * as os from 'os';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>dry-dock Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Outfit', sans-serif;
        }
        code, pre {
            font-family: 'JetBrains Mono', monospace;
        }
        /* Custom scrollbars */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #09090b;
        }
        ::-webkit-scrollbar-thumb {
            background: #27272a;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #3f3f46;
        }
    </style>
</head>
<body class="bg-[#09090b] text-zinc-100 min-h-screen p-8 selection:bg-violet-500/30 selection:text-violet-200">
    <div class="max-w-7xl mx-auto space-y-8">
        <header class="flex justify-between items-center border-b border-zinc-900 pb-6">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <span class="text-white font-extrabold text-xl">⚓</span>
                </div>
                <div>
                    <h1 class="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">dry-dock</h1>
                    <p class="text-xs text-zinc-500 font-semibold tracking-wide uppercase mt-0.5">Cross-Repository Duplication Detector</p>
                </div>
            </div>
            <div id="stats" class="text-zinc-400 text-sm bg-zinc-900/60 border border-zinc-800 px-4 py-2 rounded-full font-semibold shadow-md"></div>
        </header>

         <!-- Setup / New Scan Section -->
        <div class="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-xl p-6 relative overflow-hidden">
            <!-- Glow decoration -->
            <div class="absolute top-0 right-0 w-64 h-64 bg-violet-600/5 rounded-full filter blur-3xl pointer-events-none"></div>
            
            <h2 class="text-xl font-bold mb-4 text-zinc-100 flex items-center gap-2">
                <span class="text-violet-400">⚡</span> New Scan
            </h2>
            <div class="flex flex-col sm:flex-row gap-4 items-end relative z-10">
                <div class="flex-1 w-full">
                    <label class="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Repository Paths (comma separated)</label>
                    <input type="text" id="repo-paths" class="w-full bg-zinc-950/60 border border-zinc-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-zinc-100 placeholder-zinc-650 rounded-xl px-4 py-3 transition-all duration-200 outline-none text-sm font-medium" placeholder="/path/to/repo1, /path/to/repo2">
                </div>
                <div class="flex gap-3 w-full sm:w-auto">
                    <button id="browse-btn" onclick="browseFolder()" class="flex-1 sm:flex-initial bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-zinc-200 px-5 py-3 rounded-xl transition-all duration-200 font-semibold text-sm active:scale-95">Browse...</button>
                    <button id="scan-btn" onclick="triggerScan()" class="flex-1 sm:flex-initial bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all duration-200 transform active:scale-95">Scan Now</button>
                    <button id="cancel-btn" onclick="cancelScan()" class="flex-1 sm:flex-initial bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition-all duration-200 transform active:scale-95 hidden">Cancel</button>
                </div>
            </div>
            <div id="scan-status" class="mt-3 text-xs font-semibold text-zinc-500 tracking-wide uppercase"></div>
            <!-- Progress Bar Container -->
            <div id="progress-container" class="mt-5 space-y-2 hidden relative z-10">
                <div class="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                    <span id="progress-message" class="text-violet-400">Initializing...</span>
                    <div class="flex items-center gap-2">
                        <span id="progress-eta" class="text-zinc-500 font-semibold normal-case"></span>
                        <span id="progress-percent" class="text-zinc-400">0%</span>
                    </div>
                </div>
                <div class="w-full bg-zinc-950 border border-zinc-850 rounded-full h-3 overflow-hidden p-0.5">
                    <div id="progress-fill" class="bg-gradient-to-r from-violet-600 to-indigo-600 h-full rounded-full w-0 transition-all duration-300"></div>
                </div>
            </div>
        </div>

        <div id="results-container" class="space-y-8 hidden">
            <!-- Strategic Architecture Recommendation Section -->
            <div id="recommendation-section" class="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl p-6 relative overflow-hidden shadow-xl">
                <div class="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full filter blur-3xl pointer-events-none"></div>
                <h2 class="text-xl font-bold mb-3 text-zinc-100 flex items-center gap-2">
                    <span class="text-violet-400">🏛️</span> Strategic Architecture Recommendation
                </h2>
                <div id="recommendation-content" class="text-sm text-zinc-300 relative z-10">
                    <!-- Dynamic recommendation text will be rendered here -->
                </div>
            </div>

            <!-- Trend Analysis Section -->
            <div id="trend-section" class="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-6 hidden">
                <h2 class="text-xl font-bold mb-4 text-zinc-100 flex items-center gap-2">
                    <span class="text-cyan-400">📈</span> Trend Analysis
                </h2>
                <div id="trend-container" class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <!-- Trend metrics will be rendered here -->
                </div>
            </div>

             <!-- Leakage Matrix & Graph -->
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div class="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-xl p-6 overflow-x-auto lg:col-span-7">
                    <h2 class="text-xl font-bold mb-4 text-zinc-100 flex items-center gap-2">
                        <span class="text-indigo-400">📊</span> Project Leakage Matrix
                    </h2>
                    <div id="matrix-container" class="overflow-x-auto rounded-xl border border-zinc-800/80">
                        <!-- Matrix will be rendered here -->
                    </div>
                </div>

                <div class="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-2xl shadow-xl p-6 lg:col-span-5 flex flex-col">
                    <h2 class="text-xl font-bold mb-4 text-zinc-100 flex items-center gap-2">
                        <span class="text-pink-400">🕸️</span> Dependency Graph
                    </h2>
                    <div id="graph-container" class="w-full flex-1 flex justify-center items-center py-6 bg-[#040405] border border-zinc-850 rounded-xl min-h-[220px]">
                        <!-- Graph will be rendered here -->
                    </div>
                </div>
            </div>

            <!-- Cross-Project Leakage List -->
            <div class="space-y-6">
                <h2 class="text-2xl font-bold bg-gradient-to-r from-rose-400 to-orange-400 bg-clip-text text-transparent flex items-center gap-2">
                    <span>🔥</span> Cross-Project Leakage
                </h2>
                <div id="leakage-list" class="grid gap-4">
                    <!-- Leakage items will be rendered here -->
                </div>
            </div>
        </div>
        
        <div id="empty-state" class="text-center py-20 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-2xl">
            <div class="text-4xl mb-4">🔍</div>
            <p class="text-zinc-500 font-medium">No scan results yet. Add repository paths above and click "Scan Now" to begin.</p>
        </div>
    </div>

    <!-- Clone Inspector Modal -->
    <div id="inspector-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm hidden flex items-center justify-center p-4 z-50">
        <div class="bg-zinc-950 border border-zinc-800/80 rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">
            <div class="p-4 bg-zinc-900/50 border-b border-zinc-800/80 flex justify-between items-center">
                <h3 class="text-lg font-bold text-zinc-100 flex items-center gap-2">
                    <span class="text-violet-400">🔍</span> Clone Inspector
                </h3>
                <button onclick="closeInspector()" class="text-zinc-400 hover:text-zinc-100 text-2xl font-semibold leading-none">&times;</button>
            </div>
            <div class="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-2 gap-6" id="inspector-content">
                <!-- Code comparison will be injected here -->
            </div>
        </div>
    </div>

    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        let reportData = null;
        let progressInterval = null;
        mermaid.initialize({
            startOnLoad: true,
            theme: 'dark',
            themeVariables: {
                background: '#040405',
                primaryColor: '#1e1b4b', // indigo-950
                primaryTextColor: '#fafafa',
                primaryBorderColor: '#312e81',
                lineColor: '#6366f1', // indigo-500
                secondaryColor: '#18181b',
                tertiaryColor: '#27272a'
            }
        });

        // Attach functions to window so they can be called from HTML onclick attributes
        window.browseFolder = browseFolder;
        window.triggerScan = triggerScan;
        window.cancelScan = cancelScan;
        window.inspectClone = inspectClone;
        window.closeInspector = closeInspector;
        window.toggleDecisionPanel = toggleDecisionPanel;
        window.saveDecision = saveDecision;

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

            document.getElementById('scan-status').innerText = 'Starting scan...';
            document.getElementById('scan-btn').classList.add('hidden');
            document.getElementById('cancel-btn').classList.remove('hidden');

            const progressContainer = document.getElementById('progress-container');
            const progressFill = document.getElementById('progress-fill');
            const progressPercent = document.getElementById('progress-percent');
            const progressMsg = document.getElementById('progress-message');
            const progressEta = document.getElementById('progress-eta');

            progressContainer.classList.remove('hidden');
            progressFill.style.width = '0%';
            progressPercent.innerText = '0%';
            progressMsg.innerText = 'Initializing...';
            if (progressEta) progressEta.innerText = 'ETA: calculating...';

            const scanStartTime = Date.now();

            progressInterval = setInterval(async () => {
                try {
                    const res = await fetch('/api/scan/progress');
                    if (res.ok) {
                        const progress = await res.json();
                        if (progress.stage !== 'idle') {
                            progressFill.style.width = progress.percent + '%';
                            progressPercent.innerText = progress.percent + '%';
                            progressMsg.innerText = progress.message;

                            // Calculate ETA
                            const elapsedMs = Date.now() - scanStartTime;
                            if (progress.percent > 5 && elapsedMs > 1000) {
                                const remainingMs = (elapsedMs / progress.percent) * (100 - progress.percent);
                                const remainingSec = Math.round(remainingMs / 1000);
                                if (remainingSec > 60) {
                                    const mins = Math.floor(remainingSec / 60);
                                    const secs = remainingSec % 60;
                                    if (progressEta) progressEta.innerText = \`ETA: \${mins}m \${secs}s\`;
                                } else if (remainingSec > 0) {
                                    if (progressEta) progressEta.innerText = \`ETA: \${remainingSec}s\`;
                                } else {
                                    if (progressEta) progressEta.innerText = 'ETA: < 1s';
                                }
                            } else {
                                if (progressEta) progressEta.innerText = 'ETA: calculating...';
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error fetching scan progress', e);
                }
            }, 500);
            
            try {
                const response = await fetch('/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths })
                });

                clearInterval(progressInterval);
                progressInterval = null;
                if (progressEta) progressEta.innerText = '';
                
                if (response.ok) {
                    const report = await response.json();
                    renderReport(report);
                    document.getElementById('scan-status').innerText = 'Scan complete!';
                    progressFill.style.width = '100%';
                    progressPercent.innerText = '100%';
                    progressMsg.innerText = 'Scan completed successfully!';
                    setTimeout(() => {
                        progressContainer.classList.add('hidden');
                    }, 3000);
                } else {
                     const err = await response.json();
                     progressContainer.classList.add('hidden');
                     if (err.error === 'Scan cancelled') {
                        document.getElementById('scan-status').innerText = 'Scan cancelled.';
                     } else {
                        document.getElementById('scan-status').innerText = 'Scan failed.';
                     }
                }
            } catch (e) {
                console.error(e);
                clearInterval(progressInterval);
                progressInterval = null;
                if (progressEta) progressEta.innerText = '';
                progressContainer.classList.add('hidden');
                document.getElementById('scan-status').innerText = 'Error triggering scan.';
            } finally {
                document.getElementById('scan-btn').classList.remove('hidden');
                document.getElementById('cancel-btn').classList.add('hidden');
            }
        }

        async function cancelScan() {
             document.getElementById('scan-status').innerText = 'Cancelling...';
             if (progressInterval) {
                 clearInterval(progressInterval);
                 progressInterval = null;
             }
             const progressMsg = document.getElementById('progress-message');
             if (progressMsg) progressMsg.innerText = 'Cancelling scan...';
             const progressEta = document.getElementById('progress-eta');
             if (progressEta) progressEta.innerText = '';
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
            renderRecommendation(report);
            if (trend && trend.score_change !== undefined) {
                renderTrend(trend);
            }
        }

        function renderTrend(trend) {
            document.getElementById('trend-section').classList.remove('hidden');
            const container = document.getElementById('trend-container');
            const scoreColor = trend.score_change > 0 ? 'text-rose-400 font-bold' : (trend.score_change < 0 ? 'text-emerald-400 font-bold' : 'text-zinc-400');
            const scoreSign = trend.score_change > 0 ? '+' : '';

            container.innerHTML = \`
                <div class="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-center shadow-lg">
                    <div class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">New Leaks</div>
                    <div class="text-2xl font-extrabold text-rose-400 mt-1">\${trend.new_leaks.length}</div>
                </div>
                <div class="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-center shadow-lg">
                    <div class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Resolved Leaks</div>
                    <div class="text-2xl font-extrabold text-emerald-400 mt-1">\${trend.resolved_leaks.length}</div>
                </div>
                <div class="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-center shadow-lg">
                    <div class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Remaining Leaks</div>
                    <div class="text-2xl font-extrabold text-amber-400 mt-1">\${trend.remaining_leaks.length}</div>
                </div>
                <div class="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-center shadow-lg">
                    <div class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Score Change</div>
                    <div class="text-2xl font-extrabold \${scoreColor} mt-1">\${scoreSign}\${Math.round(trend.score_change)}</div>
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
            let html = '<table class="min-w-full border-collapse"><thead><tr><th class="p-3 bg-zinc-900 text-zinc-400 font-bold text-xs uppercase tracking-wider border border-zinc-800"></th>';
            projectList.forEach(p => {
                html += \`<th class="p-3 bg-zinc-900 text-zinc-400 font-bold text-xs uppercase tracking-wider border border-zinc-800">\${escapeHtml(p)}</th>\`;
            });
            html += '</tr></thead><tbody>';

            projectList.forEach(p1 => {
                html += \`<tr><td class="p-3 font-semibold bg-zinc-900/40 text-zinc-300 text-xs border border-zinc-800">\${escapeHtml(p1)}</td>\`;
                projectList.forEach(p2 => {
                    if (p1 === p2) {
                         html += '<td class="p-3 text-center text-zinc-700 border border-zinc-800">-</td>';
                    } else {
                        const count = matrix[p1][p2];
                        const bgClass = count > 0 ? 'bg-rose-950/40 border border-rose-800/40 text-rose-400 font-bold shadow-inner' : 'bg-zinc-900/20 text-zinc-650';
                        html += \`<td class="p-3 text-center text-sm border border-zinc-800 \${bgClass}">\${count}</td>\`;
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
                document.getElementById('graph-container').innerHTML = '<p class="text-zinc-500 italic">No cross-project dependencies to map.</p>';
            }
        }

        function renderLeakage(report) {
            const list = document.getElementById('leakage-list');
            
            const statusBadges = {
                'None': 'bg-zinc-900/60 text-zinc-400 border-zinc-800',
                'Centralize': 'bg-violet-950/40 text-violet-300 border-violet-800/40',
                'Monorepo Merge': 'bg-amber-950/40 text-amber-300 border-amber-800/40',
                'Accept': 'bg-emerald-950/40 text-emerald-300 border-emerald-800/40',
                'Investigate': 'bg-cyan-950/40 text-cyan-300 border-cyan-800/40'
            };

            const statusLabels = {
                'None': 'Pending Decision',
                'Centralize': 'Centralize in Base',
                'Monorepo Merge': 'Monorepo Merge',
                'Accept': 'Accepted (Boilerplate)',
                'Investigate': 'Under Investigation'
            };

            list.innerHTML = report.cross_project_leakage.map(item => {
                const dec = item.decision || { status: 'None', notes: '', owner: '' };
                const currentStatusLabel = statusLabels[dec.status] || 'Pending Decision';
                const currentBadgeClass = statusBadges[dec.status] || statusBadges['None'];
                
                return \`
                <div class="p-5 border-l-4 border-rose-500 bg-zinc-900/30 backdrop-blur-sm border border-zinc-800/80 rounded-xl shadow-lg shadow-black/10 flex flex-col gap-4 transition-all duration-200 hover:border-zinc-700/80 hover:bg-zinc-900/50">
                    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="font-mono text-[10px] text-zinc-500 tracking-wider uppercase">Hash: \${item.hash.slice(0, 8)}...</span>
                                <span class="border text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide \${currentBadgeClass}">\${currentStatusLabel}</span>
                            </div>
                            <div class="text-lg font-bold text-zinc-100">
                                \${item.lines} lines shared across <span class="text-violet-400">\${item.projects.map(p => escapeHtml(p)).join(', ')}</span>
                            </div>
                            <div class="text-xs text-zinc-400 mt-2 flex flex-wrap gap-2 items-center">
                                 <span>Complexity: <span class="font-bold text-amber-400">\${item.complexity}</span></span>
                                 <span class="text-zinc-650">|</span>
                                 <span>Found in:</span>
                                 \${item.occurrences.map(o => {
                                     const meta = o.author ? \` title="Last modified by \${escapeHtml(o.author)} on \${o.date}"\` : '';
                                     const ownerBadge = o.owners && o.owners.length > 0 ? \` <span class="bg-purple-950/40 text-purple-300 border border-purple-800/30 text-[9px] px-1.5 py-0.5 rounded font-semibold ml-1">\${escapeHtml(o.owners.join(', '))}</span>\` : '';
                                     return \`<span class="inline-flex items-center"><code class="bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded text-[11px] font-mono text-zinc-300 cursor-help"\${meta}>\${escapeHtml(o.file)}</code>\${ownerBadge}</span>\`;
                                 }).join(', ')}
                            </div>
                        </div>
                        <div class="text-left md:text-right min-w-[160px] flex flex-col items-start md:items-end">
                            <div class="text-3xl font-extrabold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">\${Math.round(item.score).toLocaleString()}</div>
                            <div class="text-[9px] text-zinc-500 uppercase tracking-widest font-bold mt-0.5">RefactorScore</div>
                            <div class="text-[11px] text-zinc-450 mt-1 font-semibold">Spread: \${item.spread} <span class="text-zinc-650">|</span> Freq: \${item.frequency}</div>
                            <div class="flex gap-2 mt-3 w-full justify-start md:justify-end">
                                <button onclick="inspectClone('\${item.hash}')" class="text-xs text-zinc-200 hover:text-white bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/80 hover:border-zinc-600 rounded-lg px-3 py-2 font-semibold shadow-md transition-all duration-150 transform active:scale-95">Inspect Code</button>
                                <button onclick="toggleDecisionPanel('\${item.hash}')" class="text-xs text-zinc-200 hover:text-white bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-750 rounded-lg px-3 py-2 font-semibold shadow-md transition-all duration-150 transform active:scale-95 flex items-center gap-1">
                                    <span>⚙️ Decision</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div id="decision-panel-\${item.hash}" class="hidden border-t border-zinc-800/80 pt-4 mt-2">
                        <div class="bg-zinc-950/40 border border-zinc-850 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div class="md:col-span-4">
                                <label class="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Action Status</label>
                                <select id="decision-status-\${item.hash}" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 px-3 py-2 outline-none focus:border-violet-500 transition-all font-semibold">
                                    <option value="None" \${dec.status === 'None' ? 'selected' : ''}>Select Action...</option>
                                    <option value="Centralize" \${dec.status === 'Centralize' ? 'selected' : ''}>Centralize in Base</option>
                                    <option value="Monorepo Merge" \${dec.status === 'Monorepo Merge' ? 'selected' : ''}>Monorepo Merge Candidate</option>
                                    <option value="Accept" \${dec.status === 'Accept' ? 'selected' : ''}>Accept Duplicate (Boilerplate)</option>
                                    <option value="Investigate" \${dec.status === 'Investigate' ? 'selected' : ''}>Under Investigation</option>
                                </select>
                                
                                <div class="mt-3">
                                    <label class="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Owner / Team</label>
                                    <input type="text" id="decision-owner-\${item.hash}" value="\${escapeHtml(dec.owner)}" placeholder="e.g. Core QE Team" class="w-full bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 px-3 py-2 outline-none focus:border-violet-500 transition-all font-semibold" />
                                </div>
                            </div>
                            <div class="md:col-span-8 flex flex-col">
                                <label class="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Discussion Notes & Rationale</label>
                                <textarea id="decision-notes-\${item.hash}" placeholder="Explain why this decision was made and what specific steps to take..." class="w-full flex-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 p-3 outline-none focus:border-violet-500 transition-all min-h-[80px] font-medium resize-none">\${escapeHtml(dec.notes)}</textarea>
                                <div class="flex justify-end items-center gap-3 mt-3">
                                    <span id="decision-save-status-\${item.hash}" class="text-[11px] font-semibold text-emerald-400 hidden">✓ Decision Saved</span>
                                    <button onclick="saveDecision('\${item.hash}')" class="text-xs text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 font-bold shadow-md hover:shadow-indigo-500/10 transition-all duration-150 transform active:scale-95">Save Decision</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                \`;
            }).join('');
        }

        function renderRecommendation(report) {
            const container = document.getElementById('recommendation-content');
            if (!report.cross_project_leakage || report.cross_project_leakage.length === 0) {
                container.innerHTML = '<div class="flex items-start gap-3 p-4 bg-emerald-950/20 border border-emerald-900/30 rounded-xl text-emerald-300">' +
                        '<span class="text-xl">✅</span>' +
                        '<div>' +
                            '<div class="font-bold text-zinc-100 text-base mb-1">Architecture is Clean</div>' +
                            '<p class="text-zinc-400">No cross-project code leakage was detected across the directories. The separation of your automation frameworks is clean and free of redundant duplication. Continue keeping them in separate repositories and using the shared base framework.</p>' +
                        '</div>' +
                    '</div>';
                return;
            }

            const totalLeaks = report.cross_project_leakage.length;
            const totalDuplicatedLines = report.cross_project_leakage.reduce((sum, item) => sum + item.lines, 0);
            
            const projects = new Set();
            report.cross_project_leakage.forEach(item => {
                item.projects.forEach(p => projects.add(p));
            });
            const numProjects = projects.size;

            let title = '';
            let text = '';
            let icon = '';
            let colorClass = '';

            if (numProjects >= 3 && totalDuplicatedLines > 250) {
                title = 'Recommendation: Merge into a Monorepo';
                icon = '🏢';
                colorClass = 'bg-amber-950/30 border-amber-900/40 text-amber-300';
                text = 'Pervasive structural duplication detected across <strong>' + numProjects + ' automation repositories</strong> totaling <strong>' + totalDuplicatedLines + ' lines of copied code</strong>. ' +
                    '<br/><br/>' +
                    'Because Playwright step definitions, configs, and helper modules have high structural overlap, we strongly recommend <strong>merging these individual repositories into a single Monorepo</strong>.' +
                    '<br/><br/>' +
                    '<strong>Monorepo Benefits:</strong>' +
                    '<ul class="list-disc list-inside mt-2 space-y-1 text-zinc-400 font-medium">' +
                        '<li>Unified dependency management for TypeScript, Playwright, and Cucumber.</li>' +
                        '<li>Eliminates copy-paste drift since step definitions and helper libraries live in a shared package directory and can be updated instantly for all teams.</li>' +
                        '<li>Simplified CI/CD orchestration and consistent code quality policies across all test suites.</li>' +
                    '</ul>';
            } else {
                title = 'Recommendation: Centralize Shared Packages';
                icon = '📦';
                colorClass = 'bg-violet-950/30 border-violet-900/40 text-violet-300';
                text = 'Specific duplicated modules detected across your test frameworks (totaling <strong>' + totalDuplicatedLines + ' lines</strong>). ' +
                    '<br/><br/>' +
                    'The duplication is localized to specific utilities (e.g., database connection utilities, common assertions). We recommend <strong>retaining separate repositories but abstracting these specific modules into the shared base framework</strong>.' +
                    '<br/><br/>' +
                    '<strong>Centralization Actions:</strong>' +
                    '<ul class="list-disc list-inside mt-2 space-y-1 text-zinc-400 font-medium">' +
                        '<li>Abstract high-RefactorScore clones (like the ones with scores > 100) into the base framework utility.</li>' +
                        '<li>Use standard semantic versioned packages in the 4 testing repos to call the centralized code.</li>' +
                        '<li>Establish a whitelisting threshold to reject new cross-project leakage in pull requests.</li>' +
                    '</ul>';
            }

            container.innerHTML = '<div class="flex items-start gap-4 p-5 rounded-2xl border ' + colorClass + '">' +
                    '<span class="text-3xl shrink-0 mt-0.5">' + icon + '</span>' +
                    '<div>' +
                        '<div class="font-extrabold text-zinc-50 text-lg mb-2 tracking-tight">' + title + '</div>' +
                        '<div class="text-zinc-300 leading-relaxed font-medium text-sm">' + text + '</div>' +
                        '<div class="mt-4 p-3 bg-zinc-950/60 border border-zinc-900 rounded-xl text-xs flex justify-between items-center text-zinc-400 font-semibold">' +
                            '<span>Total Leakage Items: <strong class="text-zinc-200">' + totalLeaks + '</strong></span>' +
                            '<span>Total Shared Lines: <strong class="text-zinc-200">' + totalDuplicatedLines + ' lines</strong></span>' +
                            '<span>Affected Frameworks: <strong class="text-zinc-200">' + numProjects + '</strong></span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        }

        function toggleDecisionPanel(hash) {
             const panel = document.getElementById('decision-panel-' + hash);
             panel.classList.toggle('hidden');
        }

        async function saveDecision(hash) {
             const status = document.getElementById('decision-status-' + hash).value;
             const owner = document.getElementById('decision-owner-' + hash).value;
             const notes = document.getElementById('decision-notes-' + hash).value;
             const saveStatus = document.getElementById('decision-save-status-' + hash);

             try {
                 const response = await fetch('/api/decision', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ hash, status, owner, notes })
                 });
                 if (response.ok) {
                     saveStatus.classList.remove('hidden');
                     setTimeout(async () => {
                         saveStatus.classList.add('hidden');
                         await loadData();
                     }, 1000);
                 } else {
                     alert('Error saving decision');
                 }
             } catch (e) {
                 console.error(e);
                 alert('Error saving decision');
             }
        }

        async function inspectClone(hash) {
             const item = reportData.cross_project_leakage.find(i => i.hash === hash) || reportData.internal_duplicates.find(i => i.hash === hash);
             if (!item) return;

             const modal = document.getElementById('inspector-modal');
             const content = document.getElementById('inspector-content');
             modal.classList.remove('hidden');
             content.innerHTML = '<div class="col-span-2 text-center text-zinc-400">Loading code...</div>';

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
                     const color = part.added ? 'bg-emerald-950/30 text-emerald-400 border-l border-emerald-500/50 px-1 py-0.5 rounded' :
                                   part.removed ? 'bg-rose-950/30 text-rose-400 border-l border-rose-500/50 px-1 py-0.5 rounded' : 'text-zinc-300';
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
                    <div class="flex flex-col h-full overflow-hidden border border-zinc-800/85 rounded-xl bg-zinc-950">
                        <div class="bg-zinc-900/60 p-3 border-b border-zinc-800 font-mono text-xs text-zinc-300 font-semibold flex justify-between items-center">
                            <span class="truncate" title="\${escapeHtml(file1)}">\${escapeHtml(file1)}</span>
                            <span class="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded font-bold ml-2 shrink-0">\${escapeHtml(proj1)}</span>
                        </div>
                        <pre class="flex-1 overflow-auto p-4 text-[12px] bg-zinc-950/40 text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed"><code>\${formattedCode1}</code></pre>
                    </div>
                    <div class="flex flex-col h-full overflow-hidden border border-zinc-800/85 rounded-xl bg-zinc-950">
                        <div class="bg-zinc-900/60 p-3 border-b border-zinc-800 font-mono text-xs text-zinc-300 font-semibold flex justify-between items-center">
                            <span class="truncate" title="\${escapeHtml(file2)}">\${escapeHtml(file2)}</span>
                            <span class="text-[10px] text-zinc-500 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded font-bold ml-2 shrink-0">\${escapeHtml(proj2)}</span>
                        </div>
                        <pre class="flex-1 overflow-auto p-4 text-[12px] bg-zinc-950/40 text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed"><code>\${formattedCode2}</code></pre>
                    </div>
                 \`;
             } catch (e) {
                 content.innerHTML = '<div class="col-span-2 text-red-400">Error loading diff.</div>';
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
    scanStage = 'searching';
    scanTotalFiles = 0;
    scanProcessedFiles = 0;
    scanGitTotal = 0;
    scanGitProcessed = 0;
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
    scanTotalFiles = validFiles.length;
    scanStage = 'scanning';

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
                scanProcessedFiles = processed;
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

    // Pre-fetch Git Info asynchronously in parallel batches to prevent blocking the event loop
    const uniqueFiles = new Set<string>();
    for (const [hash, data] of index.entries()) {
        if (data.occurrences.length > 1) {
            for (const occ of data.occurrences) {
                uniqueFiles.add(path.resolve(process.cwd(), occ.file));
            }
        }
    }

    console.log(`Pre-fetching git info for ${uniqueFiles.size} unique duplicate files...`);
    const gitInfoMap = new Map<string, any>();
    const uniqueFilesArray = Array.from(uniqueFiles);
    const gitBatchSize = 50;
    
    scanStage = 'fetching_git';
    scanGitTotal = uniqueFilesArray.length;
    scanGitProcessed = 0;

    for (let i = 0; i < uniqueFilesArray.length; i += gitBatchSize) {
        if (shouldCancel) break;
        const batch = uniqueFilesArray.slice(i, i + gitBatchSize);
        const results = await Promise.all(batch.map(async (file) => {
            const info = await getGitInfoAsync(file);
            return { file, info };
        }));
        for (const res of results) {
            if (res.info) {
                gitInfoMap.set(res.file, res.info);
            }
        }
        scanGitProcessed += batch.length;
    }
    console.log('Finished pre-fetching git info.');
    scanStage = 'completed';

    const internal_duplicates: InternalDuplicate[] = [];
    const cross_project_leakage: CrossProjectLeakage[] = [];

    for (const [hash, data] of index.entries()) {
        const frequency = data.occurrences.length;
        // Only report duplicates
        if (frequency <= 1) continue;

        // Enrich occurrences with git info now that we know they are duplicates
        const enrichedOccurrences = data.occurrences.map(occ => {
            const fullPath = path.resolve(process.cwd(), occ.file);
            const gitInfo = gitInfoMap.get(fullPath) || null;
            const owners = getCodeOwners(fullPath);
            return {
                ...occ,
                ...(gitInfo && { author: gitInfo.author, date: gitInfo.date }),
                ...(owners && owners.length > 0 && { owners })
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

let scanStage: 'idle' | 'searching' | 'scanning' | 'fetching_git' | 'completed' = 'idle';
let scanTotalFiles = 0;
let scanProcessedFiles = 0;
let scanGitTotal = 0;
let scanGitProcessed = 0;

async function main() {
    const args = process.argv.slice(2);

    // Parse args
    let minLines = 0;
    const minLinesIndex = args.indexOf('--min-lines');
    if (minLinesIndex !== -1 && args[minLinesIndex + 1]) {
        minLines = parseInt(args[minLinesIndex + 1], 10);
    }

    // Parse extract threshold and dir
    const extractThresholdIndex = args.indexOf('--extract-threshold');
    let extractThreshold: number | null = null;
    if (extractThresholdIndex !== -1 && args[extractThresholdIndex + 1]) {
        extractThreshold = parseFloat(args[extractThresholdIndex + 1]);
    }

    const extractDirIndex = args.indexOf('--extract-dir');
    let extractDir = 'extracted-libs';
    if (extractDirIndex !== -1 && args[extractDirIndex + 1]) {
        extractDir = args[extractDirIndex + 1];
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

    // Parse PR comment
    const prComment = args.includes('--pr-comment');
    const prNumberIndex = args.indexOf('--pr-number');
    let explicitPrNumber: number | null = null;
    if (prNumberIndex !== -1 && args[prNumberIndex + 1]) {
        explicitPrNumber = parseInt(args[prNumberIndex + 1], 10);
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
                    case 'pdf':
                        await exportToPDF(currentReport, 'drydock-report.pdf');
                        console.log('Report saved to drydock-report.pdf');
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
                        console.log(`New leaks introduced: ${trend.new_leaks.length}`);
                        console.log(`Leaks resolved: ${trend.resolved_leaks.length}`);
                        console.log(`Leaks remaining: ${trend.remaining_leaks.length}`);
                        console.log(`Total RefactorScore change: ${trend.score_change > 0 ? '+' : ''}${Math.round(trend.score_change)}`);
                        console.log('----------------------\n');
                    } catch (err) {
                        console.warn('Failed to parse old report for comparison:', err);
                    }
                } else {
                    console.warn(`Comparison report not found at: ${comparePath}`);
                }
            }

            if (prComment) {
                const token = process.env.GITHUB_TOKEN;
                const repo = process.env.GITHUB_REPOSITORY;
                let prNum: number | null = explicitPrNumber;

                if (!prNum && process.env.GITHUB_REF) {
                    const match = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)\/(merge|head)/);
                    if (match) {
                        prNum = parseInt(match[1], 10);
                    }
                }

                if (!token || !repo || !prNum) {
                    console.error('Error posting PR comment: GITHUB_TOKEN, GITHUB_REPOSITORY, and PR number (via GITHUB_REF or --pr-number) must be set.');
                } else if (!currentTrendData) {
                    console.warn('Skipping PR comment: No trend analysis available (use --compare) to identify new leaks.');
                } else {
                    console.log(`Posting DryDock report of *new leaks* to PR ${repo}#${prNum}...`);
                    const prNotifier = new GitHubPRNotifier(token, repo, prNum);
                    try {
                        const newLeaksReport: DryDockReport = {
                            internal_duplicates: [], // We only post cross-project leaks
                            cross_project_leakage: currentTrendData.new_leaks
                        };
                        await prNotifier.notify(newLeaksReport);
                        console.log('PR comment posted successfully.');
                    } catch (e: any) {
                        console.error(`Error posting PR comment: ${e.message}`);
                    }
                }
            }

            if (extractThreshold !== null) {
                console.log(`\nExtracting libraries with RefactorScore >= ${extractThreshold}...`);
                const extractor = new LibraryExtractor();
                extractor.extract(currentReport, extractThreshold, extractDir);
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
                    const report = currentReport || { internal_duplicates: [], cross_project_leakage: [] };
                    
                    const decisionsPath = path.resolve(process.cwd(), 'drydock-decisions.json');
                    let decisions: Record<string, any> = {};
                    if (fs.existsSync(decisionsPath)) {
                        try {
                            decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
                        } catch (e) {
                            console.error('Error loading decisions:', e);
                        }
                    }

                    const annotatedLeakage = report.cross_project_leakage.map((item: any) => {
                        const dec = decisions[item.hash];
                        return {
                            ...item,
                            decision: dec || { status: 'None', notes: '', owner: '' }
                        };
                    });

                    res.end(JSON.stringify({
                        ...report,
                        cross_project_leakage: annotatedLeakage
                    }));
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
                '/api/scan/progress': (req, res) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    let percent = 0;
                    let message = 'Idle';
                    if (scanStage === 'searching') {
                        percent = 5;
                        message = 'Searching repository files...';
                    } else if (scanStage === 'scanning') {
                        const ratio = scanTotalFiles > 0 ? (scanProcessedFiles / scanTotalFiles) : 0;
                        percent = Math.round(5 + 75 * ratio);
                        message = `Analyzing code duplication (${scanProcessedFiles}/${scanTotalFiles} files)...`;
                    } else if (scanStage === 'fetching_git') {
                        const ratio = scanGitTotal > 0 ? (scanGitProcessed / scanGitTotal) : 0;
                        percent = Math.round(80 + 20 * ratio);
                        message = `Fetching git blame history (${scanGitProcessed}/${scanGitTotal} files)...`;
                    } else if (scanStage === 'completed') {
                        percent = 100;
                        message = 'Finalizing reports...';
                    }
                    res.end(JSON.stringify({
                        stage: scanStage,
                        processed: scanProcessedFiles,
                        total: scanTotalFiles,
                        gitProcessed: scanGitProcessed,
                        gitTotal: scanGitTotal,
                        percent,
                        message
                    }));
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
                                scanStage = 'idle';
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(currentReport));
                            } else {
                                res.writeHead(400);
                                res.end('Invalid paths');
                            }
                        } catch (e: any) {
                            scanStage = 'idle';
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
                },
                '/api/decision': (req, res) => {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        try {
                            const decision = JSON.parse(body);
                            if (decision && decision.hash && decision.status) {
                                const decisionsPath = path.resolve(process.cwd(), 'drydock-decisions.json');
                                let decisions: Record<string, any> = {};
                                if (fs.existsSync(decisionsPath)) {
                                    decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf-8'));
                                }
                                decisions[decision.hash] = {
                                    status: decision.status,
                                    notes: decision.notes || '',
                                    owner: decision.owner || '',
                                    updatedAt: new Date().toISOString()
                                };
                                fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2), 'utf-8');
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true }));
                            } else {
                                res.writeHead(400);
                                res.end('Invalid decision payload');
                            }
                        } catch (e: any) {
                            console.error('Error saving decision:', e);
                            res.writeHead(500);
                            res.end('Error saving decision');
                        }
                    });
                }
            }
        };

        const server = http.createServer(async (req, res) => {
            const actualPort = (server.address() as any)?.port || initialPort;
            const parsedUrl = new URL(req.url || '', `http://localhost:${actualPort}`);
            const method = req.method || 'GET';
            const pathname = parsedUrl.pathname;
            console.log(`[SERVER]: ${method} ${pathname}`);

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
