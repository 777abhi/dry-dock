import * as http from 'http';
import { ProjectWebhookNotifier } from '../src/notifier';
import { DryDockReport } from '../src/types';

async function runTests() {
    const receivedPayloads: { [project: string]: any } = {};

    // Create a mock webhook server to receive multiple project webhooks
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.method === 'POST') {
                try {
                    const data = JSON.parse(body);
                    // use url to determine which project this is
                    const match = req.url?.match(/^\/webhook\/(.+)$/);
                    if (match && match[1]) {
                        receivedPayloads[match[1]] = data;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400);
                    res.end();
                }
            } else {
                res.writeHead(405);
                res.end();
            }
        });
    });

    server.listen(0, async () => {
        const port = (server.address() as any).port;
        const urlA = `http://localhost:${port}/webhook/projectA`;
        const urlB = `http://localhost:${port}/webhook/projectB`;
        const urlC = `http://localhost:${port}/webhook/projectC`;

        const webhookMap = {
            'Project-A': urlA,
            'Project-B': urlB,
            'Project-C': urlC
        };

        const notifier = new ProjectWebhookNotifier(webhookMap);

        const dummyReport: DryDockReport = {
            cross_project_leakage: [
                {
                    hash: '123',
                    lines: 10,
                    complexity: 2,
                    frequency: 2,
                    score: 100,
                    spread: 2,
                    projects: ['Project-A', 'Project-B'],
                    occurrences: [
                        { project: 'Project-A', file: 'a.js' },
                        { project: 'Project-B', file: 'b.js' }
                    ]
                }
            ],
            internal_duplicates: [
                {
                    hash: '456',
                    lines: 20,
                    complexity: 4,
                    frequency: 2,
                    score: 50,
                    project: 'Project-A',
                    occurrences: ['a1.js', 'a2.js']
                }
            ]
        };

        try {
            await notifier.notify(dummyReport);

            // Verify Project-A received notification (it has cross leakage and internal duplicates)
            if (!receivedPayloads['projectA']) {
                console.error('FAIL: Webhook for Project-A did not receive data');
                process.exit(1);
            }
            if (receivedPayloads['projectA'].cross_project_leaks !== 1 || receivedPayloads['projectA'].internal_duplicates !== 1) {
                console.error('FAIL: Project-A payload is incorrect', receivedPayloads['projectA']);
                process.exit(1);
            }

            // Verify Project-B received notification (it has cross leakage, but no internal duplicates)
            if (!receivedPayloads['projectB']) {
                console.error('FAIL: Webhook for Project-B did not receive data');
                process.exit(1);
            }
            if (receivedPayloads['projectB'].cross_project_leaks !== 1 || receivedPayloads['projectB'].internal_duplicates !== 0) {
                console.error('FAIL: Project-B payload is incorrect', receivedPayloads['projectB']);
                process.exit(1);
            }

            // Verify Project-C did NOT receive notification (it has no leakage)
            if (receivedPayloads['projectC']) {
                console.error('FAIL: Webhook for Project-C received data unexpectedly', receivedPayloads['projectC']);
                process.exit(1);
            }

            console.log('PASS: All ProjectWebhookNotifier tests passed.');
            server.close();
            process.exit(0);
        } catch (err) {
            console.error('FAIL: ProjectWebhookNotifier threw an error', err);
            server.close();
            process.exit(1);
        }
    });
}

runTests();
