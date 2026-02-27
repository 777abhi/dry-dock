import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { scanFile } from '../src/scanner';

const fixtureRoot = path.join(__dirname, 'cli_whitelist_fixture');

function setup() {
    if (fs.existsSync(fixtureRoot)) {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }

    // Proj A
    fs.mkdirSync(path.join(fixtureRoot, 'projA'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'projA', 'package.json'), '{}');
    const fileA = path.join(fixtureRoot, 'projA', 'main.ts');
    fs.writeFileSync(fileA, 'console.log("hello this is a duplicate");');

    // Proj B (Duplicate)
    fs.mkdirSync(path.join(fixtureRoot, 'projB'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'projB', 'go.mod'), '');
    const fileB = path.join(fixtureRoot, 'projB', 'script.ts');
    fs.writeFileSync(fileB, 'console.log("hello this is a duplicate");');

    // Get the hash of the duplicate file directly
    const result = scanFile(fileA);
    if (!result) {
        throw new Error("scanFile returned null");
    }

    return result.hash;
}

function run() {
    const hashToWhitelist = setup();

    try {
        const reportPath = 'drydock-report.json';
        if (fs.existsSync(reportPath)) {
            fs.unlinkSync(reportPath);
        }

        // Run initial scan to prove it's duplicated
        const cmd1 = `npx ts-node src/drydock.ts scan ${fixtureRoot}`;
        execSync(cmd1, { encoding: 'utf-8', cwd: process.cwd() });

        if (!fs.existsSync(reportPath)) {
            console.error('FAIL: drydock-report.json was not created on first run.');
            process.exit(1);
        }

        let report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
        let foundLeakage = report.cross_project_leakage.some((v: any) => v.hash === hashToWhitelist);

        if (!foundLeakage) {
            console.error('FAIL: Expected to find the duplicated code in cross_project_leakage without whitelist.');
            process.exit(1);
        }
        console.log('PASS: Found un-whitelisted duplicate code correctly.');

        // Now setup the whitelist
        const whitelistPath = path.join(process.cwd(), '.drydockwhitelist');
        fs.writeFileSync(whitelistPath, hashToWhitelist + '\n');

        // Run scan again with the default .drydockwhitelist file
        execSync(cmd1, { encoding: 'utf-8', cwd: process.cwd() });
        report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

        foundLeakage = report.cross_project_leakage.some((v: any) => v.hash === hashToWhitelist);

        if (foundLeakage) {
            console.error('FAIL: Whitelisted hash was still reported in cross_project_leakage using default .drydockwhitelist file.');
            process.exit(1);
        }
        console.log('PASS: Whitelisted hash was correctly ignored using .drydockwhitelist.');

        // Cleanup
        fs.unlinkSync(whitelistPath);

        // Test explicit --whitelist option
        const customWhitelistPath = path.join(process.cwd(), 'custom-whitelist.txt');
        fs.writeFileSync(customWhitelistPath, hashToWhitelist + '\n');

        const cmd2 = `npx ts-node src/drydock.ts scan ${fixtureRoot} --whitelist ${customWhitelistPath}`;
        execSync(cmd2, { encoding: 'utf-8', cwd: process.cwd() });
        report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

        foundLeakage = report.cross_project_leakage.some((v: any) => v.hash === hashToWhitelist);

        if (foundLeakage) {
            console.error('FAIL: Whitelisted hash was still reported using --whitelist argument.');
            process.exit(1);
        }
        console.log('PASS: Whitelisted hash was correctly ignored using --whitelist option.');

        fs.unlinkSync(customWhitelistPath);
        console.log('All whitelist tests passed.');

    } catch (e) {
        console.error('FAIL: CLI whitelist execution failed', e);
        process.exit(1);
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });

        // Ensure cleanup if test fails mid-way
        const defaultWlPath = path.join(process.cwd(), '.drydockwhitelist');
        if (fs.existsSync(defaultWlPath)) fs.unlinkSync(defaultWlPath);

        const customWlPath = path.join(process.cwd(), 'custom-whitelist.txt');
        if (fs.existsSync(customWlPath)) fs.unlinkSync(customWlPath);
    }
}

run();
