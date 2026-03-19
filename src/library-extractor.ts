import * as fs from 'fs';
import * as path from 'path';
import { DryDockReport, CrossProjectLeakage } from './types';

export class LibraryExtractor {
    public extract(report: DryDockReport, threshold: number, outputDir: string): void {
        const candidates = report.cross_project_leakage.filter(item => item.score >= threshold);

        if (candidates.length === 0) {
            console.log(`No cross-project leakage items meet the extraction threshold of ${threshold}.`);
            return;
        }

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let extractedCount = 0;

        for (const candidate of candidates) {
            if (candidate.occurrences.length === 0) continue;

            const libName = `shared-lib-${candidate.hash.substring(0, 12)}`;
            const libDir = path.join(outputDir, libName);

            if (!fs.existsSync(libDir)) {
                fs.mkdirSync(libDir, { recursive: true });
            }

            // Generate package.json
            const packageJson = {
                name: libName,
                version: '1.0.0',
                description: `Automatically extracted shared library for duplicate hash ${candidate.hash}`,
                main: 'index.js',
                scripts: {
                    test: 'echo "Error: no test specified" && exit 1'
                },
                keywords: ['dry-dock', 'shared-library', 'auto-extracted'],
                author: 'DryDock Auto-Extractor',
                license: 'ISC'
            };

            fs.writeFileSync(path.join(libDir, 'package.json'), JSON.stringify(packageJson, null, 2));

            // Copy source file to index.js
            const sourceOccurrence = candidate.occurrences[0];
            const sourceFile = typeof sourceOccurrence === 'string' ? sourceOccurrence : sourceOccurrence.file;
            const fullSourcePath = path.resolve(process.cwd(), sourceFile);

            if (fs.existsSync(fullSourcePath)) {
                fs.copyFileSync(fullSourcePath, path.join(libDir, 'index.js'));
            } else {
                // If it's a test environment where files might just be mocked and not exist relative to cwd
                // we can attempt to just use the path as-is if it's absolute
                if (fs.existsSync(sourceFile)) {
                     fs.copyFileSync(sourceFile, path.join(libDir, 'index.js'));
                } else {
                     console.warn(`Warning: Could not find source file ${sourceFile} to copy to ${libName}/index.js`);
                     fs.writeFileSync(path.join(libDir, 'index.js'), '// Source file could not be found during extraction.\n');
                }
            }

            extractedCount++;
        }

        console.log(`Successfully extracted ${extractedCount} shared libraries to ${outputDir}`);
    }
}
