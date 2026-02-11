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
        // Skip whitespace, newlines, and comments to normalize code structure
        if (['empty', 'new_line', 'comment'].includes(token.type)) {
            continue;
        }

        // Mask identifiers to detect structural clones
        // 'default' and 'function' are common types for identifiers and function names in @jscpd/tokenizer
        if (['default', 'function'].includes(token.type)) {
            // Skip empty tokens that are misclassified as default
            if (!token.value) continue;
            normalized += '__ID__';
        } else {
            normalized += token.value;
        }
    }

    if (normalized.length === 0) {
        return null;
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
