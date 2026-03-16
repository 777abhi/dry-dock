import { DryDockReport, InternalDuplicate, CrossProjectLeakage } from './types';

export function exportToCSV(report: DryDockReport): string {
    const headers = ['Type', 'Hash', 'Lines', 'Frequency', 'Score', 'Spread', 'Projects', 'Occurrences'];
    const rows: string[] = [headers.join(',')];

    // Helper to escape CSV fields
    const escape = (field: any) => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    report.cross_project_leakage.forEach(item => {
        const occurrences = item.occurrences.map(o => `${o.file}${o.author ? ` (${o.author})` : ''}`).join('; ');
        rows.push([
            'Cross-Project',
            item.hash,
            item.lines,
            item.frequency,
            item.score.toFixed(2),
            item.spread,
            escape(item.projects.join(', ')),
            escape(occurrences)
        ].join(','));
    });

    report.internal_duplicates.forEach(item => {
        const occurrences = item.occurrences.join('; ');
        rows.push([
            'Internal',
            item.hash,
            item.lines,
            item.frequency,
            item.score.toFixed(2),
            1, // Spread is 1
            escape(item.project),
            escape(occurrences)
        ].join(','));
    });

    return rows.join('\n');
}

export function exportToJUnit(report: DryDockReport): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n';

    // Cross Project Leakage
    xml += `  <testsuite name="Cross Project Leakage" tests="${report.cross_project_leakage.length}" failures="${report.cross_project_leakage.length}">\n`;
    report.cross_project_leakage.forEach(item => {
        xml += `    <testcase name="Hash: ${item.hash.slice(0, 8)}" classname="CrossProjectLeakage">\n`;
        xml += `      <failure message="${item.lines} lines shared across ${item.projects.length} projects">\n`;
        xml += `        Score: ${item.score.toFixed(2)}\n`;
        xml += `        Projects: ${item.projects.join(', ')}\n`;
        xml += `        Occurrences: ${item.occurrences.map(o => o.file).join(', ')}\n`;
        xml += `      </failure>\n`;
        xml += `    </testcase>\n`;
    });
    xml += `  </testsuite>\n`;

    // Internal Duplicates
    xml += `  <testsuite name="Internal Duplicates" tests="${report.internal_duplicates.length}" failures="${report.internal_duplicates.length}">\n`;
    report.internal_duplicates.forEach(item => {
        xml += `    <testcase name="Hash: ${item.hash.slice(0, 8)}" classname="InternalDuplicate.${item.project}">\n`;
        xml += `      <failure message="${item.lines} lines duplicated within ${item.project}">\n`;
        xml += `        Score: ${item.score.toFixed(2)}\n`;
        xml += `        Occurrences: ${item.occurrences.join(', ')}\n`;
        xml += `      </failure>\n`;
        xml += `    </testcase>\n`;
    });
    xml += `  </testsuite>\n`;

    xml += '</testsuites>';
    return xml;
}

export function exportToHTML(report: DryDockReport, template: string): string {
    // Inject the report data into the template
    // We replace the fetch logic with direct data injection
    const replacement = `loadData = async () => {
             reportData = ${JSON.stringify(report)};
             renderStats(reportData);
             renderMatrix(reportData);
             renderLeakage(reportData);
        };`;

    return template.replace(/loadData\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\};/, replacement);
}

export function exportToMermaid(report: DryDockReport): string {
    const lines = ['graph TD'];
    const nodes = new Set<string>();
    const edges = new Map<string, number>();

    const sanitizeId = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_');

    report.cross_project_leakage.forEach(leak => {
        // Create an edge for every unique pair of projects in this leak
        for (let i = 0; i < leak.projects.length; i++) {
            for (let j = i + 1; j < leak.projects.length; j++) {
                const p1 = leak.projects[i];
                const p2 = leak.projects[j];

                // Add to nodes set to ensure we declare them with clean names later
                nodes.add(p1);
                nodes.add(p2);

                const sourceId = sanitizeId(p1);
                const targetId = sanitizeId(p2);

                // Sort to ensure undirected representation if we want,
                // but TD implies directed, so let's just use alphabetical order for consistency
                const [a, b] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];

                const edgeKey = `${a}:::${b}`;
                const currentWeight = edges.get(edgeKey) || 0;
                edges.set(edgeKey, currentWeight + leak.lines);
            }
        }
    });

    // Add node definitions
    nodes.forEach(project => {
        lines.push(`    ${sanitizeId(project)}["${project}"]`);
    });

    // Add edges
    edges.forEach((weight, edgeKey) => {
        const [source, target] = edgeKey.split(':::');
        lines.push(`    ${source} -->|${weight} lines| ${target}`);
    });

    return lines.join('\n');
}
