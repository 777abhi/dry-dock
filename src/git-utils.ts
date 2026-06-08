import { spawnSync, spawn } from 'child_process';
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

export function getGitInfoAsync(filepath: string): Promise<GitInfo | null> {
    return new Promise((resolve) => {
        try {
            const dir = path.dirname(filepath);
            const file = path.basename(filepath);

            const child = spawn('git', ['-C', dir, 'log', '-1', '--format=%an|%ad', '--date=short', '--', file], {
                stdio: ['ignore', 'pipe', 'ignore']
            });

            let output = '';
            child.stdout?.on('data', (data) => {
                output += data.toString();
            });

            child.on('close', (code) => {
                if (code !== 0) {
                    resolve(null);
                    return;
                }
                const trimmed = output.trim();
                if (!trimmed) {
                    resolve(null);
                    return;
                }
                const [author, date] = trimmed.split('|');
                resolve({ author, date });
            });

            child.on('error', () => {
                resolve(null);
            });
        } catch (e) {
            resolve(null);
        }
    });
}
