import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import { getCodeOwners } from '../src/codeowners';

const tempRoot = path.join(__dirname, 'temp_codeowners');

function setup() {
    if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(tempRoot, { recursive: true });

    // Mock project with CODEOWNERS
    fs.mkdirSync(path.join(tempRoot, 'project-a'));
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'package.json'), '{}'); // project root indicator

    const codeownersContent = `
# This is a comment
*       @global-owner
*.ts    @ts-owner
src/    @src-owner
src/utils/ @utils-owner
`;
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'CODEOWNERS'), codeownersContent.trim());

    // Create some mock files
    fs.mkdirSync(path.join(tempRoot, 'project-a', 'src', 'utils'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'README.md'), '');
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'index.ts'), '');
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'src', 'app.js'), '');
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'src', 'utils', 'helper.ts'), '');
    // nested dir for testing *.ts deep matching
    fs.mkdirSync(path.join(tempRoot, 'project-a', 'deep', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'project-a', 'deep', 'nested', 'file.ts'), '');

    // Mock project with .github/CODEOWNERS
    fs.mkdirSync(path.join(tempRoot, 'project-b', '.github'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'project-b', 'package.json'), '{}'); // project root indicator
    fs.writeFileSync(path.join(tempRoot, 'project-b', '.github', 'CODEOWNERS'), '*.js @js-owner\n');
    fs.writeFileSync(path.join(tempRoot, 'project-b', 'main.js'), '');
}

function runTests() {
    setup();

    console.log('Testing CODEOWNERS parsing and matching...');

    try {
        // Test global fallback
        const readmeOwners = getCodeOwners(path.join(tempRoot, 'project-a', 'README.md'));
        assert.deepStrictEqual(readmeOwners, ['@global-owner'], 'Failed to match global wildcard');

        // Test extension match overrides global
        const indexOwners = getCodeOwners(path.join(tempRoot, 'project-a', 'index.ts'));
        assert.deepStrictEqual(indexOwners, ['@ts-owner'], 'Failed to match extension');

        // Test extension match for deeply nested files
        const nestedTsOwners = getCodeOwners(path.join(tempRoot, 'project-a', 'deep', 'nested', 'file.ts'));
        assert.deepStrictEqual(nestedTsOwners, ['@ts-owner'], 'Failed to match extension for deeply nested file');

        // Test directory match
        const appOwners = getCodeOwners(path.join(tempRoot, 'project-a', 'src', 'app.js'));
        assert.deepStrictEqual(appOwners, ['@src-owner'], 'Failed to match directory');

        // Test more specific directory match overrides less specific
        // Note: order in file matters, not specificity, but in our file src/utils/ is after src/ and *.ts
        const helperOwners = getCodeOwners(path.join(tempRoot, 'project-a', 'src', 'utils', 'helper.ts'));
        assert.deepStrictEqual(helperOwners, ['@utils-owner'], 'Failed to match more specific directory or honor last matching rule');

        // Test .github/CODEOWNERS
        const mainOwners = getCodeOwners(path.join(tempRoot, 'project-b', 'main.js'));
        assert.deepStrictEqual(mainOwners, ['@js-owner'], 'Failed to find/parse .github/CODEOWNERS');

        console.log('PASS: getCodeOwners correctly identified owners.');
    } catch (e: any) {
        console.error('FAIL: CODEOWNERS test failed', e.message);
        process.exitCode = 1;
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

runTests();
