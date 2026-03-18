import * as assert from 'assert';
import * as http from 'http';
import { GitHubPRNotifier } from '../src/notifier';
import { DryDockReport } from '../src/types';

function runTest() {
    console.log('Testing GitHubPRNotifier...');

    // We only pass the new leaks to the PR notifier as defined in drydock.ts
    const mockReport: DryDockReport = {
        internal_duplicates: [],
        cross_project_leakage: [
            {
                hash: 'abcdef123456',
                lines: 50,
                complexity: 10,
                frequency: 2,
                spread: 2,
                score: 100.55,
                projects: ['proj-a', 'proj-b'],
                occurrences: [
                    { project: 'proj-a', file: 'src/a.ts' },
                    { project: 'proj-b', file: 'src/b.ts' }
                ]
            }
        ]
    };

    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                assert.strictEqual(req.url, '/repos/my-org/my-repo/issues/42/comments', 'Incorrect URL');
                assert.strictEqual(req.method, 'POST', 'Incorrect Method');
                assert.strictEqual(req.headers['authorization'], 'token dummy_token', 'Missing Auth header');
                assert.strictEqual(req.headers['user-agent'], 'dry-dock', 'Missing User-Agent');

                const payload = JSON.parse(body);
                assert.ok(payload.body, 'Missing body in payload');
                assert.ok(payload.body.includes('DryDock detected'), 'Missing introduction in markdown');
                assert.ok(payload.body.includes('proj-a, proj-b'), 'Missing projects in markdown');
                assert.ok(payload.body.includes('100.55'), 'Missing score in markdown');

                res.writeHead(201);
                res.end('{}');
                console.log('PASS: GitHubPRNotifier formatted and sent correctly.');
                server.close();
            } catch (e: any) {
                console.error('FAIL:', e.message);
                server.close();
                process.exitCode = 1;
            }
        });
    });

    server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        process.env.GITHUB_API_URL = `http://127.0.0.1:${port}`;
        // Since we include the port in the URL now and use parsedUrl.port,
        // we can optionally rely on that or test the override:
        process.env.GITHUB_API_PORT = port.toString();

        const notifier = new GitHubPRNotifier('dummy_token', 'my-org/my-repo', 42);
        notifier.notify(mockReport).catch(e => {
             console.error('FAIL: notify threw an error:', e.message);
             server.close();
             process.exitCode = 1;
        });
    });
}

runTest();
