import * as fs from 'fs';
import * as crypto from 'crypto';
import { tokenize, getFormatByFile } from '@jscpd/tokenizer';
import { identifyProject } from './project-identifier';

export interface ScanResult {
    hash: string;
    project: string;
    path: string;
    lines: number;
}

export function scanFile(filePath: string): ScanResult | null {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).length;

    // Default to 'unknown' format if detection fails, though jscpd usually handles extensions well.
    // If format is unknown, jscpd might not tokenize correctly.
    const format = getFormatByFile(filePath) || 'javascript';

    let tokens: any[];
    try {
        tokens = tokenize(content, format);
    } catch (e) {
        console.warn(`Failed to tokenize ${filePath}, skipping normalization.`);
        return null;
    }

    if (!tokens || tokens.length === 0) {
        return null;
    }

    let normalized = '';

    for (const token of tokens) {
        // Skip whitespace, newlines, comments
        // Note: 'comment' might need verification if jscpd produces it.
        // Based on my manual test, I didn't see 'comment' but I saw 'empty' and 'new_line'.
        // I'll assume 'comment' exists or check for it.
        // Actually, if I look at my previous output, I had a comment `// this is a comment`.
        // Let's check if it was in the output.
        // I'll re-verify the token output for comments if needed, but usually tokenizers have a 'comment' type.
        // Checking my previous run... I don't see the comment in the output!
        // Wait, the code had `// this is a comment`.
        // The output jumped from `start: { line: 4...` to next.
        // Line 4 in my code: `function add(a, b) {`
        // Line 5: `// this is a comment`
        // Line 6: `return a + b;`
        // The tokens showed `type: "punctuation", "value": "{"` (line 4)
        // Then `type: "new_line"` (line 4->5)
        // Then `type: "new_line"` (line 5->6)
        // So the comment was CONSUMED/IGNORED by `tokenize` implicitly?
        // Or maybe treated as `empty`?
        // I see `range` [61, 62] (}) -> [62, 63] (\n).
        // If the comment is missing, that's great! It means `jscpd` tokenizer (or the underlying Prism/etc) strips comments or I missed it.
        // I will assume for now I just need to filter `empty` and `new_line`.

        if (token.type === 'empty' || token.type === 'new_line' || token.type === 'comment') {
            continue;
        }

        // Normalize identifiers
        // 'default' seems to be identifiers.
        // 'function' seems to be function names.
        if (token.type === 'default' || token.type === 'function') {
            normalized += '__ID__';
        } else {
            normalized += token.value;
        }
    }

    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    const project = identifyProject(filePath);

    return {
        hash,
        project,
        path: filePath,
        lines
    };
}
