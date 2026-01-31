import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { scanFile } from './scanner';

interface Occurrence {
    project: string;
    file: string;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: drydock <files_or_directories>');
        process.exit(1);
    }

    const entries: string[] = [];

    // Expand directories to globs
    const patterns = args.map(arg => {
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

        for (const file of files) {
            // Only scan files
            if (!fs.statSync(file).isFile()) continue;

            try {
               const result = scanFile(file);
               if (result) {
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

        const report = Array.from(index.entries()).map(([hash, data]) => {
            const frequency = data.occurrences.length;
            const projects = new Set(data.occurrences.map(o => o.project));
            const spread = projects.size;
            const lines = data.lines;
            // RefactorScore = P (Spread) * F (Frequency) * L (Lines)
            const score = spread * frequency * lines;
            const isLibraryCandidate = spread > 1;

            return {
                hash,
                lines,
                frequency,
                spread,
                score,
                isLibraryCandidate,
                occurrences: data.occurrences
            };
        });

        // Rank clones by RefactorScore descending
        report.sort((a, b) => b.score - a.score);

        console.log(JSON.stringify(report, null, 2));

    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
