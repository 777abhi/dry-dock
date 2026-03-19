import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { LibraryExtractor } from '../src/library-extractor';
import { DryDockReport, CrossProjectLeakage } from '../src/types';

const testDir = path.join(__dirname, 'temp_test_extractor');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}

const sourceFile1 = path.join(testDir, 'source1.js');
const sourceFile2 = path.join(testDir, 'source2.js');
const outputDir = path.join(testDir, 'output');

fs.writeFileSync(sourceFile1, 'console.log("duplicate code");');
fs.writeFileSync(sourceFile2, 'console.log("duplicate code");');

const mockReport: DryDockReport = {
    internal_duplicates: [],
    cross_project_leakage: [
        {
            hash: 'mockhash123',
            lines: 10,
            complexity: 2,
            frequency: 2,
            spread: 2,
            score: 100, // Meets threshold of 50
            projects: ['projA', 'projB'],
            occurrences: [
                { file: sourceFile1, project: 'projA' },
                { file: sourceFile2, project: 'projB' }
            ]
        },
        {
            hash: 'mockhash456',
            lines: 5,
            complexity: 1,
            frequency: 2,
            spread: 2,
            score: 30, // Does not meet threshold of 50
            projects: ['projC', 'projD'],
            occurrences: [
                { file: sourceFile1, project: 'projC' },
                { file: sourceFile2, project: 'projD' }
            ]
        }
    ]
};

try {
    const extractor = new LibraryExtractor();
    extractor.extract(mockReport, 50, outputDir);

    const extractedDir = path.join(outputDir, 'shared-lib-mockhash123');
    assert.strictEqual(fs.existsSync(extractedDir), true, 'Extracted directory should exist for score >= threshold');

    const packageJsonPath = path.join(extractedDir, 'package.json');
    assert.strictEqual(fs.existsSync(packageJsonPath), true, 'package.json should exist');

    const indexJsPath = path.join(extractedDir, 'index.js');
    assert.strictEqual(fs.existsSync(indexJsPath), true, 'index.js should exist');

    const indexJsContent = fs.readFileSync(indexJsPath, 'utf8');
    assert.strictEqual(indexJsContent, 'console.log("duplicate code");', 'index.js content should match source');

    const notExtractedDir = path.join(outputDir, 'shared-lib-mockhash456');
    assert.strictEqual(fs.existsSync(notExtractedDir), false, 'Directory should not exist for score < threshold');

    console.log('PASS: Automated Library Extraction logic verified.');
} catch (e) {
    console.error('FAIL:', e);
    process.exit(1);
} finally {
    fs.rmSync(testDir, { recursive: true, force: true });
}
