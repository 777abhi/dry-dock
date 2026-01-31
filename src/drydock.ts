import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as url from 'url';
import fg from 'fast-glob';
import { scanFile } from './scanner';
import { getIgnorePatterns } from './utils';
import { getGitInfo } from './git-utils';

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DryDock Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-8">
    <div class="max-w-7xl mx-auto space-y-8">
        <header class="flex justify-between items-center">
            <h1 class="text-3xl font-bold text-gray-800">DryDock Dashboard</h1>
            <div id="stats" class="text-gray-600"></div>
        </header>

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
        async function loadData() {
            try {
                const response = await fetch('/api/data');
                const report = await response.json();
                renderStats(report);
                renderMatrix(report);
                renderLeakage(report);
            } catch (error) {
                console.error('Error loading data:', error);
                document.body.innerHTML = '<div class="text-red-600 text-center p-8">Error loading report data. Ensure server is running.</div>';
            }
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
                html += \`<th class="border p-2 bg-gray-50 font-semibold text-sm rotate-0">\${p}</th>\`;
            });
            html += '</tr></thead><tbody>';

            projectList.forEach(p1 => {
                html += \`<tr><td class="border p-2 font-semibold bg-gray-50 text-sm">\${p1}</td>\`;
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
                            \${item.lines} lines shared across <span class="text-blue-600">\${item.projects.join(', ')}</span>
                        </div>
                        <div class="text-sm text-gray-600 mt-2">
                             Found in: \${item.occurrences.map(o => {
                                 const meta = o.author ? \` title="Last modified by \${o.author} on \${o.date}"\` : '';
                                 return \`<code class="bg-gray-100 px-1 py-0.5 rounded text-xs cursor-help"\${meta}>\${o.file}</code>\`;
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
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${occ1.file} (\${occ1.project})</div>
                        <pre class="flex-1 overflow-auto p-4 text-xs bg-gray-50"><code>\${escapeHtml(code1)}</code></pre>
                    </div>
                    <div class="flex flex-col h-full overflow-hidden border rounded">
                        <div class="bg-gray-100 p-2 border-b font-mono text-sm font-semibold">\${occ2.file} (\${occ2.project})</div>
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
            return text
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
             renderStats(reportData);
             renderMatrix(reportData);
             renderLeakage(reportData);
        };

        loadData();
    </script>
</body>
</html>`;

interface Occurrence {
    project: string;
    file: string;
    author?: string;
    date?: string;
}

interface InternalDuplicate {
    hash: string;
    lines: number;
    frequency: number;
    score: number;
    project: string;
    occurrences: string[];
}

interface CrossProjectLeakage {
    hash: string;
    lines: number;
    frequency: number;
    spread: number;
    score: number;
    projects: string[];
    occurrences: Occurrence[];
}

interface DryDockReport {
    internal_duplicates: InternalDuplicate[];
    cross_project_leakage: CrossProjectLeakage[];
}

async function main() {
    const args = process.argv.slice(2);
    const shouldOpen = args.includes('--open');

    // Parse --min-lines
    let minLines = 0;
    const minLinesIndex = args.indexOf('--min-lines');
    if (minLinesIndex !== -1 && args[minLinesIndex + 1]) {
        minLines = parseInt(args[minLinesIndex + 1], 10);
    }

    const failOnLeaks = args.includes('--fail');

    const scanArgs = args.filter((arg, index) => {
        if (arg === '--open') return false;
        if (arg === '--fail') return false;
        if (arg === '--min-lines') return false;
        if (index > 0 && args[index - 1] === '--min-lines') return false;
        return true;
    });

    if (scanArgs.length === 0) {
        console.error('Usage: drydock <files_or_directories> [--open] [--min-lines <number>] [--fail]');
        process.exit(1);
    }

    const entries: string[] = [];

    // Expand directories to globs
    const patterns = scanArgs.map(arg => {
        if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
            return path.join(arg, '**', '*');
        }
        return arg;
    });

    try {
        const ignorePatterns = [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/.idea/**',
            '**/.vscode/**',
            ...getIgnorePatterns()
        ];

        const files = await fg(patterns, {
            dot: false,
            ignore: ignorePatterns,
            absolute: true
        });

        const index = new Map<string, { occurrences: Occurrence[], lines: number }>();
        const allProjects = new Set<string>();

        for (const file of files) {
            // Only scan files
            if (!fs.statSync(file).isFile()) continue;

            try {
               const result = scanFile(file);
               if (result) {
                   if (result.lines < minLines) continue;

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

        const report: DryDockReport = {
            internal_duplicates: internal_duplicates.sort((a, b) => b.score - a.score),
            cross_project_leakage: cross_project_leakage.sort((a, b) => b.score - a.score)
        };

        // Save to drydock-report.json
        fs.writeFileSync('drydock-report.json', JSON.stringify(report, null, 2));

        console.log(`Found ${allProjects.size} project roots`);

        if (failOnLeaks && cross_project_leakage.length > 0) {
            console.error(`CI Failure: ${cross_project_leakage.length} cross-project leaks detected.`);
            process.exitCode = 1;
        }

        if (shouldOpen) {
            const server = http.createServer((req, res) => {
                const parsedUrl = url.parse(req.url || '', true);

                if (parsedUrl.pathname === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(DASHBOARD_HTML);
                } else if (parsedUrl.pathname === '/api/data') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(report));
                } else if (parsedUrl.pathname === '/api/code') {
                    let fileParam = parsedUrl.query.file;
                    if (Array.isArray(fileParam)) {
                        fileParam = fileParam[0];
                    }

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

            server.listen(3000, () => {
                console.log('Dashboard successfully launched at http://localhost:3000');
            });

            // Keep process alive
            await new Promise(() => {});
        } else {
            console.log('Dashboard successfully launched at localhost:3000 (Run with --open to view)');
        }

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
