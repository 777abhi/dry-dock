import * as fs from 'fs';
import * as path from 'path';

interface CodeOwnerRule {
    patternStr: string;
    regex: RegExp;
    owners: string[];
}

interface ProjectCache {
    rules: CodeOwnerRule[];
    projectRoot: string;
}

// Cache project roots and parsed rules
const ownersCache = new Map<string, ProjectCache | null>();

export function getCodeOwners(filePath: string): string[] | undefined {
    let currentDir = path.dirname(path.resolve(filePath));
    const root = path.parse(currentDir).root;

    // Look up in cache by traversing upwards
    let searchDir = currentDir;
    let cacheHit: ProjectCache | null | undefined = undefined;

    while (searchDir !== root) {
        if (ownersCache.has(searchDir)) {
            cacheHit = ownersCache.get(searchDir);
            break;
        }
        searchDir = path.dirname(searchDir);
    }

    if (ownersCache.has(root) && cacheHit === undefined) {
         cacheHit = ownersCache.get(root);
    }

    let projectRoot: string | null = null;
    let rules: CodeOwnerRule[] = [];

    if (cacheHit !== undefined) {
        if (cacheHit === null) return undefined;
        projectRoot = cacheHit.projectRoot;
        rules = cacheHit.rules;
    } else {
        // 1. Find project root
        let tempDir = currentDir;
        while (tempDir !== root) {
            if (
                fs.existsSync(path.join(tempDir, 'package.json')) ||
                fs.existsSync(path.join(tempDir, 'go.mod')) ||
                fs.existsSync(path.join(tempDir, '.git'))
            ) {
                projectRoot = tempDir;
                break;
            }
            tempDir = path.dirname(tempDir);
        }

        if (!projectRoot) {
            // Check root dir itself
            if (
                fs.existsSync(path.join(root, 'package.json')) ||
                fs.existsSync(path.join(root, 'go.mod')) ||
                fs.existsSync(path.join(root, '.git'))
            ) {
                projectRoot = root;
            }
        }

        if (!projectRoot) {
            ownersCache.set(currentDir, null);
            return undefined;
        }

        // 2. Look for CODEOWNERS file
        const locations = [
            'CODEOWNERS',
            '.github/CODEOWNERS',
            'docs/CODEOWNERS'
        ];

        let codeownersContent: string | null = null;
        for (const loc of locations) {
            const fullPath = path.join(projectRoot, loc);
            if (fs.existsSync(fullPath)) {
                codeownersContent = fs.readFileSync(fullPath, 'utf8');
                break;
            }
        }

        if (!codeownersContent) {
            ownersCache.set(projectRoot, null);
            ownersCache.set(currentDir, null);
            return undefined;
        }

        // 3. Parse rules
        const lines = codeownersContent.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const parts = trimmed.split(/\s+/);
            if (parts.length < 2) continue;

            const pattern = parts[0];
            const owners = parts.slice(1);

            const regex = compilePattern(pattern);
            if (regex) {
                 rules.push({ patternStr: pattern, regex, owners });
            }
        }

        const cacheEntry = { projectRoot, rules };
        ownersCache.set(projectRoot, cacheEntry);
        if (projectRoot !== currentDir) {
             ownersCache.set(currentDir, cacheEntry);
        }
    }

    if (!projectRoot) return undefined;

    // Match rules against relative path
    const relativePath = path.relative(projectRoot, filePath);
    const normalizedPath = relativePath.split(path.sep).join('/');

    let matchedOwners: string[] | undefined = undefined;

    for (const rule of rules) {
        if (rule.regex.test(normalizedPath)) {
            matchedOwners = rule.owners;
        }
    }

    return matchedOwners;
}

export function compilePattern(pattern: string): RegExp | null {
    if (pattern === '*') {
        return /^.*$/;
    }

    let p = pattern;

    // A pattern starting with a slash means it matches from the root of the project
    let isRooted = false;
    if (p.startsWith('/')) {
        isRooted = true;
        p = p.substring(1);
    }

    // A pattern without a slash (e.g. *.ts or Makefile) matches anywhere in the tree
    // However, if it contains a slash anywhere (like src/ or docs/*.md), it is relative to the root unless it starts with **
    if (!isRooted && !p.includes('/')) {
        p = '**/' + p;
    }

    // Escape regex special chars EXCEPT * and ?
    // Escaping manually to avoid escaping * and ? which are handled below
    const escaped = [];
    for (let i = 0; i < p.length; i++) {
        const c = p[i];
        if (['.', '+', '(', ')', '[', ']', '{', '}', '^', '$', '|', '\\'].includes(c)) {
            escaped.push('\\' + c);
        } else {
            escaped.push(c);
        }
    }
    p = escaped.join('');

    // Handle /**/ specifically
    p = p.replace(/\/\*\*\//g, '(?:/|/.+/)');

    // Replace ? with [^/] before adding regex operators containing ?
    p = p.replace(/\?/g, '[^/]');

    // Replace ** with a special marker to avoid mangling during single * replacement
    p = p.replace(/\*\*/g, '___DOUBLE_STAR___');

    // Replace single * with [^/]* (matches anything except slash)
    p = p.replace(/\*/g, '[^/]*');

    // Replace special marker back to .* (matches anything including slash)
    p = p.replace(/^___DOUBLE_STAR___\//, '(?:.*/)?');
    p = p.replace(/___DOUBLE_STAR___/g, '.*');

    // Handle trailing slash
    let endMatcher = '$';
    if (p.endsWith('/')) {
        p = p.substring(0, p.length - 1); // remove the trailing slash
        endMatcher = '(?:/.*)?$';
    } else {
        endMatcher = '(?:/.*)?$';
    }

    let regexStr = '^' + p + endMatcher;

    try {
        return new RegExp(regexStr);
    } catch (e) {
        return null;
    }
}
