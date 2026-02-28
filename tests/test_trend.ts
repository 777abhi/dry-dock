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

runTests();
