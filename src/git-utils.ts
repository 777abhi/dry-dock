import { spawnSync } from 'child_process';
import * as path from 'path';

export interface GitInfo {
    author: string;
    date: string;
}

export function getGitInfo(filepath: string): GitInfo | null {
    try {
        const dir = path.dirname(filepath);
        const file = path.basename(filepath);

        // Use spawnSync with arguments array to prevent command injection
        const result = spawnSync('git', ['-C', dir, 'log', '-1', '--format=%an|%ad', '--date=short', '--', file], {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'] // ignore stderr and stdin
        });

        if (result.error || result.status !== 0) {
            return null;
        }

        const output = result.stdout.trim();
        if (!output) return null;

        const [author, date] = output.split('|');
        return { author, date };
    } catch (e) {
        return null;
    }
}
