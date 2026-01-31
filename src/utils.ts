import * as fs from 'fs';
import * as path from 'path';

export function getIgnorePatterns(cwd: string = process.cwd()): string[] {
    const ignoreFile = path.join(cwd, '.drydockignore');
    if (!fs.existsSync(ignoreFile)) {
        return [];
    }

    const content = fs.readFileSync(ignoreFile, 'utf-8');
    return content
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
}
