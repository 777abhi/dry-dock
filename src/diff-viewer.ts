import { diffLines, Change } from 'diff';

export interface IDiffService {
    getDiff(source1: string, source2: string): Change[];
}

export class DiffService implements IDiffService {
    getDiff(source1: string, source2: string): Change[] {
        return diffLines(source1, source2);
    }
}
