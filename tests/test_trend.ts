import { analyzeTrend, TrendResult } from '../src/trend';
import { DryDockReport, CrossProjectLeakage } from '../src/types';

function createMockLeakage(hash: string, score: number): CrossProjectLeakage {
    return {
        hash,
        lines: 10,
        frequency: 2,
        spread: 2,
        score,
        projects: ['projA', 'projB'],
        occurrences: []
    };
}

function runTests() {
    console.log("Testing analyzeTrend...");

    const oldReport: DryDockReport = {
        internal_duplicates: [],
        cross_project_leakage: [
            createMockLeakage('hash1', 100), // Remains
            createMockLeakage('hash2', 50)  // Resolved
        ]
    };

    const newReport: DryDockReport = {
        internal_duplicates: [],
        cross_project_leakage: [
            createMockLeakage('hash1', 100), // Remains
            createMockLeakage('hash3', 200)  // New
        ]
    };

    const result: TrendResult = analyzeTrend(oldReport, newReport);

    if (result.newLeaks.length !== 1 || result.newLeaks[0].hash !== 'hash3') {
        console.error("FAIL: Expected 1 new leak (hash3), got:", result.newLeaks);
        process.exit(1);
    }

    if (result.resolvedLeaks.length !== 1 || result.resolvedLeaks[0].hash !== 'hash2') {
        console.error("FAIL: Expected 1 resolved leak (hash2), got:", result.resolvedLeaks);
        process.exit(1);
    }

    if (result.remainingLeaks.length !== 1 || result.remainingLeaks[0].hash !== 'hash1') {
        console.error("FAIL: Expected 1 remaining leak (hash1), got:", result.remainingLeaks);
        process.exit(1);
    }

    if (result.scoreChange !== 150) { // New total (300) - Old total (150) = 150
        console.error("FAIL: Expected scoreChange of 150, got:", result.scoreChange);
        process.exit(1);
    }

    console.log("PASS: analyzeTrend correctly identified new, resolved, and remaining leaks, and calculated score change.");
}

import * as http from 'http';
import { exec } from 'child_process';
import * as path from 'path';

async function testApiEndpoint() {
    console.log("Testing /api/trend endpoint...");

    // Start the dashboard server in a child process
    const scriptPath = path.join(__dirname, '..', 'src', 'drydock.ts');
    const child = exec(`npx ts-node ${scriptPath} scan . --open`);

    // Wait for the server to start using a retry mechanism
    let isServerUp = false;
    for (let i = 0; i < 20; i++) {
        try {
            await new Promise<void>((resolve, reject) => {
                http.get('http://localhost:3000', (res) => {
                    resolve();
                }).on('error', reject);
            });
            isServerUp = true;
            break;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (!isServerUp) {
        console.error("FAIL: Dashboard server failed to start.");
        if (child.pid) { try { process.kill(child.pid); } catch (e) {} }
        process.exit(1);
    }

    let hasError = false;

    try {
        const data = await new Promise<string>((resolve, reject) => {
            http.get('http://localhost:3000/api/trend', (res) => {
                let rawData = '';
                res.on('data', (chunk) => { rawData += chunk; });
                res.on('end', () => { resolve(rawData); });
            }).on('error', (e) => {
                reject(e);
            });
        });

        const parsed = JSON.parse(data);
        if (!parsed.newLeaks || !parsed.resolvedLeaks || !parsed.remainingLeaks || parsed.scoreChange === undefined) {
             console.error("FAIL: /api/trend endpoint returned invalid payload:", parsed);
             hasError = true;
        } else {
             console.log("PASS: /api/trend endpoint returned valid trend structure.");
        }
    } catch (e) {
        console.error("FAIL: Could not reach /api/trend endpoint:", e);
        hasError = true;
    } finally {
        if (child.pid) {
            try { process.kill(child.pid); } catch (e) {}
            // On Windows, child.kill might be needed, but kill works on Posix
            try { child.kill('SIGTERM'); } catch (e) {}
        }
        process.exit(hasError ? 1 : 0);
    }
}

async function runAll() {
    runTests();
    await testApiEndpoint();
}

runAll();
