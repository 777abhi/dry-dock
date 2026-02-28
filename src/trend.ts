import { DryDockReport, CrossProjectLeakage } from './types';

export interface TrendResult {
    newLeaks: CrossProjectLeakage[];
    resolvedLeaks: CrossProjectLeakage[];
    remainingLeaks: CrossProjectLeakage[];
    scoreChange: number;
}

export function analyzeTrend(oldReport: DryDockReport, newReport: DryDockReport): TrendResult {
    const oldLeaksMap = new Map<string, CrossProjectLeakage>();
    let oldScore = 0;

    for (const leak of oldReport.cross_project_leakage) {
        oldLeaksMap.set(leak.hash, leak);
        oldScore += leak.score;
    }

    const newLeaksMap = new Map<string, CrossProjectLeakage>();
    let newScore = 0;

    for (const leak of newReport.cross_project_leakage) {
        newLeaksMap.set(leak.hash, leak);
        newScore += leak.score;
    }

    const newLeaks: CrossProjectLeakage[] = [];
    const remainingLeaks: CrossProjectLeakage[] = [];
    const resolvedLeaks: CrossProjectLeakage[] = [];

    // Identify new and remaining
    for (const [hash, leak] of newLeaksMap.entries()) {
        if (oldLeaksMap.has(hash)) {
            remainingLeaks.push(leak);
        } else {
            newLeaks.push(leak);
        }
    }

    // Identify resolved
    for (const [hash, leak] of oldLeaksMap.entries()) {
        if (!newLeaksMap.has(hash)) {
            resolvedLeaks.push(leak);
        }
    }

    return {
        newLeaks,
        resolvedLeaks,
        remainingLeaks,
        scoreChange: newScore - oldScore
    };
}
