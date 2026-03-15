import * as assert from 'assert';
import { DryDockReport } from '../src/types';
// We use require to let the test fail if exportToMermaid is not implemented yet
const { exportToMermaid } = require('../src/reporter');

const mockReport: DryDockReport = {
    internal_duplicates: [],
    cross_project_leakage: [
        {
            hash: '123',
            lines: 50,
            complexity: 2,
            frequency: 2,
            spread: 2,
            score: 100,
            projects: ['api-service', 'web-client'],
            occurrences: []
        },
        {
            hash: '456',
            lines: 20,
            complexity: 1,
            frequency: 2,
            spread: 2,
            score: 40,
            projects: ['api-service', 'web-client'],
            occurrences: []
        },
        {
            hash: '789',
            lines: 30,
            complexity: 3,
            frequency: 2,
            spread: 2,
            score: 60,
            projects: ['api-service', 'auth-service'],
            occurrences: []
        }
    ]
};

function runTest() {
    console.log('Testing exportToMermaid...');

    if (typeof exportToMermaid !== 'function') {
        console.error('FAIL: exportToMermaid is not implemented');
        process.exit(1);
    }

    const result = exportToMermaid(mockReport);

    // Check if the graph type is included
    assert.ok(result.includes('graph TD'), 'Should define graph type as TD');

    // Check if node sanitization and edge weights are correct
    assert.ok(result.includes('api_service["api-service"]'), 'Should sanitize node IDs');
    assert.ok(result.includes('web_client["web-client"]'), 'Should sanitize node IDs');
    assert.ok(result.includes('api_service -->|70 lines| web_client'), 'Should aggregate lines correctly');

    assert.ok(result.includes('auth_service["auth-service"]'), 'Should sanitize node IDs');
    assert.ok(result.includes('api_service -->|30 lines| auth_service'), 'Should aggregate lines correctly');

    console.log('PASS: exportToMermaid correctly generates Mermaid graph.');
}

runTest();
