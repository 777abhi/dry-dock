import { DryDockReport, CrossProjectLeakage } from './types';

export interface TrendResult {
    new_leaks: CrossProjectLeakage[];
    resolved_leaks: CrossProjectLeakage[];
    remaining_leaks: CrossProjectLeakage[];
    score_change: number;
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

    const new_leaks: CrossProjectLeakage[] = [];
    const remaining_leaks: CrossProjectLeakage[] = [];
    const resolved_leaks: CrossProjectLeakage[] = [];

    // Identify new and remaining
    for (const [hash, leak] of newLeaksMap.entries()) {
        if (oldLeaksMap.has(hash)) {
            remaining_leaks.push(leak);
        } else {
            new_leaks.push(leak);
        }
    }

    // Identify resolved
    for (const [hash, leak] of oldLeaksMap.entries()) {
        if (!newLeaksMap.has(hash)) {
            resolved_leaks.push(leak);
        }
    }

    return {
        new_leaks,
        resolved_leaks,
        remaining_leaks,
        score_change: newScore - oldScore
    };
}
