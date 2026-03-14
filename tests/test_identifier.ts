import * as fs from 'fs';
import * as path from 'path';
import { identifyProject } from '../src/project-identifier';

const tempRoot = path.join(__dirname, 'temp_identifier');

function setup() {
    if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    fs.mkdirSync(path.join(tempRoot, 'projA', 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'projA', 'package.json'), '{"name": "@scope/projA"}');
    fs.writeFileSync(path.join(tempRoot, 'projA', 'src', 'file.ts'), '');

    fs.mkdirSync(path.join(tempRoot, 'projB'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'projB', 'go.mod'), 'module github.com/org/projB');
    fs.writeFileSync(path.join(tempRoot, 'projB', 'main.go'), '');

    fs.mkdirSync(path.join(tempRoot, 'deep', 'nested', 'projC', 'lib', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'deep', 'nested', 'projC', '.git'), { recursive: true }); // .git is a dir
    fs.writeFileSync(path.join(tempRoot, 'deep', 'nested', 'projC', 'lib', 'utils', 'helper.js'), '');
}

function runTests() {
    setup();

    const cases = [
        { file: path.join(tempRoot, 'projA', 'src', 'file.ts'), expected: '@scope/projA' },
        { file: path.join(tempRoot, 'projB', 'main.go'), expected: 'github.com/org/projB' },
        { file: path.join(tempRoot, 'deep', 'nested', 'projC', 'lib', 'utils', 'helper.js'), expected: 'projC' }
    ];

    let passed = 0;
    for (const c of cases) {
        const result = identifyProject(c.file);
        if (result === c.expected) {
            console.log(`PASS: ${c.expected}`);
            passed++;
        } else {
            console.error(`FAIL: ${c.file} -> Expected ${c.expected}, got ${result}`);
        }
    }

    // Cleanup
    fs.rmSync(tempRoot, { recursive: true, force: true });

    if (passed === cases.length) {
        console.log('All identifier tests passed.');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests();
