import { DiffService } from '../src/diff-viewer';
import * as assert from 'assert';

function testDiff() {
    console.log('Testing DiffService...');

    const diffService = new DiffService();

    const source1 = `function hello() {\n  console.log("world");\n}`;
    const source2 = `function hello() {\n  console.log("universe");\n}`;

    try {
        const diff = diffService.getDiff(source1, source2);

        assert.ok(diff.length > 0, 'Diff should not be empty');

        // Find changed parts
        const additions = diff.filter(c => c.added);
        const deletions = diff.filter(c => c.removed);

        assert.ok(additions.length > 0, 'Should detect added lines');
        assert.ok(deletions.length > 0, 'Should detect removed lines');

        console.log('PASS: DiffService correctly generated differences.');
    } catch (e: any) {
        console.error('FAIL: DiffService test failed.', e.message);
        process.exit(1);
    }
}

testDiff();
