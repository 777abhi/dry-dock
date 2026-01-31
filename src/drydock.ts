import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import fg from 'fast-glob';
import { scanFile } from './scanner';

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
                             Found in: \${item.occurrences.map(o => \`<code class="bg-gray-100 px-1 py-0.5 rounded text-xs">\${o.file}</code>\`).join(', ')}
                        </div>
                    </div>
                    <div class="text-left md:text-right min-w-[150px]">
                        <div class="text-3xl font-bold text-blue-600">\${Math.round(item.score).toLocaleString()}</div>
                        <div class="text-xs text-gray-400 uppercase tracking-wider font-semibold">RefactorScore</div>
                        <div class="text-xs text-gray-500 mt-1">Spread: \${item.spread} | Freq: \${item.frequency}</div>
                    </div>
                </div>
            \`).join('');
        }

        loadData();
    </script>
</body>
</html>`;

interface Occurrence {
    project: string;
    file: string;
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
    const scanArgs = args.filter(arg => arg !== '--open');

    if (scanArgs.length === 0) {
        console.error('Usage: drydock <files_or_directories> [--open]');
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
        const files = await fg(patterns, {
            dot: false,
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.idea/**', '**/.vscode/**'],
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

            const projects = Array.from(new Set(data.occurrences.map(o => o.project)));
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
                    occurrences: data.occurrences
                });
            } else {
                internal_duplicates.push({
                    hash,
                    lines,
                    frequency,
                    score,
                    project: projects[0],
                    occurrences: data.occurrences.map(o => o.file)
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

        if (shouldOpen) {
            const server = http.createServer((req, res) => {
                if (req.url === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(DASHBOARD_HTML);
                } else if (req.url === '/api/data') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(report));
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
