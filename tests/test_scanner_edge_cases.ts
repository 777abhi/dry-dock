import { scanFile } from '../src/scanner';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

const testDir = path.join(__dirname, 'temp_test_scanner');
if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
}

const emptyFile = path.join(testDir, 'empty.js');
const commentFile = path.join(testDir, 'comment.js');

try {
    fs.writeFileSync(emptyFile, '');
    fs.writeFileSync(commentFile, '// This is just a comment\n/* block comment */');

    console.log('Testing empty file...');
    const res1 = scanFile(emptyFile);
    assert.strictEqual(res1, null, 'Empty file should return null');
    console.log('PASS: Empty file returned null');

    console.log('Testing comment-only file...');
    const res2 = scanFile(commentFile);
    assert.strictEqual(res2, null, 'Comment-only file should return null');
    console.log('PASS: Comment-only file returned null');

} catch (e) {
    console.error('FAIL:', e);
    process.exit(1);
} finally {
    fs.rmSync(testDir, { recursive: true, force: true });
}
