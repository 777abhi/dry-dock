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
const sourceFile3 = path.join(testDir, 'source3.js');
const sourceVuln = path.join(testDir, 'source_vuln.js');
const outputDir = path.join(testDir, 'output');

fs.writeFileSync(sourceFile1, '/* MIT License */\nconsole.log("duplicate code");');
fs.writeFileSync(sourceFile2, '/* Apache License 2.0 */\nconsole.log("duplicate code");');
fs.writeFileSync(sourceFile3, 'console.log("duplicate code");');
fs.writeFileSync(sourceVuln, 'eval("console.log(\'bad\');");');

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
                { file: sourceFile1, project: 'projB' }
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
                { file: sourceFile3, project: 'projC' },
                { file: sourceFile3, project: 'projD' }
            ]
        },
        {
            hash: 'mockhash789',
            lines: 10,
            complexity: 2,
            frequency: 2,
            spread: 2,
            score: 100, // Meets threshold of 50
            projects: ['projE', 'projF'],
            occurrences: [
                { file: sourceFile2, project: 'projE' },
                { file: sourceFile2, project: 'projF' }
            ]
        },
        {
            hash: 'mockhashvuln123',
            lines: 10,
            complexity: 2,
            frequency: 2,
            spread: 2,
            score: 100, // Meets threshold of 50
            projects: ['projG', 'projH'],
            occurrences: [
                { file: sourceVuln, project: 'projG' },
                { file: sourceVuln, project: 'projH' }
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

    const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    assert.strictEqual(packageJsonContent.license, 'MIT', 'license should be MIT inferred from source1');

    const indexJsPath = path.join(extractedDir, 'index.js');
    assert.strictEqual(fs.existsSync(indexJsPath), true, 'index.js should exist');

    const indexJsContent = fs.readFileSync(indexJsPath, 'utf8');
    assert.strictEqual(indexJsContent, '/* MIT License */\nconsole.log("duplicate code");', 'index.js content should match source');

    const extractedDir2 = path.join(outputDir, 'shared-lib-mockhash789');
    assert.strictEqual(fs.existsSync(extractedDir2), true, 'Extracted directory should exist for mockhash789');
    const packageJsonPath2 = path.join(extractedDir2, 'package.json');
    assert.strictEqual(fs.existsSync(packageJsonPath2), true, 'package.json should exist for mockhash789');

    const packageJsonContent2 = JSON.parse(fs.readFileSync(packageJsonPath2, 'utf8'));
    assert.strictEqual(packageJsonContent2.license, 'Apache-2.0', 'license should be Apache-2.0 inferred from source2');

    const notExtractedDir = path.join(outputDir, 'shared-lib-mockhash456');
    assert.strictEqual(fs.existsSync(notExtractedDir), false, 'Directory should not exist for score < threshold');

    const vulnExtractedDir = path.join(outputDir, 'shared-lib-mockhashvuln123');
    assert.strictEqual(fs.existsSync(vulnExtractedDir), false, 'Directory should not exist for vulnerable code even if score >= threshold');

    console.log('PASS: Automated Library Extraction logic verified.');
} catch (e) {
    console.error('FAIL:', e);
    process.exit(1);
} finally {
    fs.rmSync(testDir, { recursive: true, force: true });
}
