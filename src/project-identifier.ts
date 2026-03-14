import * as fs from 'fs';
import * as path from 'path';

interface IProjectIdentifierStrategy {
    identify(dir: string): string | null;
}

class NpmProjectStrategy implements IProjectIdentifierStrategy {
    identify(dir: string): string | null {
        const pkgPath = path.join(dir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            try {
                const content = fs.readFileSync(pkgPath, 'utf8');
                const parsed = JSON.parse(content);
                if (parsed.name) {
                    return parsed.name;
                }
            } catch (e) {
                // Ignore parse errors, fallback to dir name
            }
            return path.basename(dir);
        }
        return null;
    }
}

class GoModProjectStrategy implements IProjectIdentifierStrategy {
    identify(dir: string): string | null {
        const modPath = path.join(dir, 'go.mod');
        if (fs.existsSync(modPath)) {
            try {
                const content = fs.readFileSync(modPath, 'utf8');
                const match = content.match(/^module\s+([^\s]+)/m);
                if (match && match[1]) {
                    return match[1];
                }
            } catch (e) {
                // Ignore read errors, fallback to dir name
            }
            return path.basename(dir);
        }
        return null;
    }
}

class GitProjectStrategy implements IProjectIdentifierStrategy {
    identify(dir: string): string | null {
        if (fs.existsSync(path.join(dir, '.git'))) {
            return path.basename(dir);
        }
        return null;
    }
}

export function identifyProject(filePath: string): string {
    let currentDir = path.dirname(path.resolve(filePath));
    const root = path.parse(currentDir).root;

    const strategies: IProjectIdentifierStrategy[] = [
        new NpmProjectStrategy(),
        new GoModProjectStrategy(),
        new GitProjectStrategy()
    ];

    while (currentDir !== root) {
        for (const strategy of strategies) {
            const name = strategy.identify(currentDir);
            if (name) {
                return name;
            }
        }
        currentDir = path.dirname(currentDir);
    }

    // Check the root directory as well (edge case)
    for (const strategy of strategies) {
        const name = strategy.identify(currentDir);
        if (name) {
            return name;
        }
    }

    // Fallback: Use the immediate parent directory name if no marker found
    // Or return 'unknown'
    return 'unknown';
}
