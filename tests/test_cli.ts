import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const fixtureRoot = path.join(__dirname, 'cli_fixture');

function setup() {
    if (fs.existsSync(fixtureRoot)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }

    // Proj A
    fs.mkdirSync(path.join(fixtureRoot, 'projA'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'projA', 'package.json'), '{}');
    fs.writeFileSync(path.join(fixtureRoot, 'projA', 'main.ts'), 'console.log("hello");');

    // Proj B (Duplicate)
    fs.mkdirSync(path.join(fixtureRoot, 'projB'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'projB', 'go.mod'), '');
    fs.writeFileSync(path.join(fixtureRoot, 'projB', 'script.ts'), 'console.log("hello");');

    // Proj C (Unique)
    fs.mkdirSync(path.join(fixtureRoot, 'projC'), { recursive: true });
    // .git usually is a directory, but file works for exists check
    fs.mkdirSync(path.join(fixtureRoot, 'projC', '.git'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'projC', 'unique.ts'), 'console.log("world");');
}

function run() {
    setup();

    try {
        // We pass fixtureRoot to the CLI.
        // Note: ts-node execution needs to be careful about cwd.
        // We'll run from repo root.
        const cmd = `npx ts-node src/drydock.ts ${fixtureRoot}`;
        const output = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() });
        const report = JSON.parse(output);

        // console.log('CLI Output:', JSON.stringify(report, null, 2));

        // Check for duplicate hash
        const duplicateEntry = report.find((v: any) => v.occurrences.length === 2);

        if (duplicateEntry) {
            console.log('PASS: Found duplicate entry.');
            const projects = duplicateEntry.occurrences.map((o: any) => o.project).sort();
            if (JSON.stringify(projects) === JSON.stringify(['projA', 'projB'])) {
                console.log('PASS: Projects identified correctly.');
            } else {
                console.error('FAIL: Projects mismatch:', projects);
                process.exit(1);
            }

            // Verify RefactorScore components
            if (duplicateEntry.spread === 2 && duplicateEntry.frequency === 2 && duplicateEntry.isLibraryCandidate === true) {
                console.log('PASS: RefactorScore metrics for duplicate correct.');
            } else {
                console.error('FAIL: RefactorScore metrics mismatch:', duplicateEntry);
                process.exit(1);
            }
        } else {
            console.error('FAIL: No duplicate entry found.');
            process.exit(1);
        }

        // Check unique
        const uniqueEntry = report.find((v: any) => v.occurrences.length === 1 && v.occurrences[0].project === 'projC');
        if (uniqueEntry) {
            console.log('PASS: Found unique entry.');
            if (uniqueEntry.spread === 1 && uniqueEntry.isLibraryCandidate === false) {
                console.log('PASS: RefactorScore metrics for unique correct.');
            } else {
                console.error('FAIL: RefactorScore metrics mismatch for unique:', uniqueEntry);
                process.exit(1);
            }
        } else {
            console.error('FAIL: Unique entry for projC not found.');
             process.exit(1);
        }

    } catch (e) {
        console.error('FAIL: CLI execution failed', e);
        process.exit(1);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
}

run();
