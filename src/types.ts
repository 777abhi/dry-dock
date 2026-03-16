export interface Occurrence {
    project: string;
    file: string;
    author?: string;
    date?: string;
    owners?: string[];
}

export interface InternalDuplicate {
    hash: string;
    lines: number;
    complexity: number;
    frequency: number;
    score: number;
    project: string;
    occurrences: string[];
}

export interface CrossProjectLeakage {
    hash: string;
    lines: number;
    complexity: number;
    frequency: number;
    spread: number;
    score: number;
    projects: string[];
    occurrences: Occurrence[];
}

export interface DryDockReport {
    internal_duplicates: InternalDuplicate[];
    cross_project_leakage: CrossProjectLeakage[];
}
