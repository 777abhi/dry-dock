import * as http from 'http';
import { WebhookNotifier } from '../src/notifier';
import { DryDockReport } from '../src/types';

async function runTests() {
    let receivedData: any = null;

    // Create a mock webhook server
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (req.method === 'POST') {
                try {
                    receivedData = JSON.parse(body);
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
        const url = `http://localhost:${port}/webhook`;

        const notifier = new WebhookNotifier(url);
        const dummyReport: DryDockReport = {
            cross_project_leakage: [
                {
                    hash: '123',
                    lines: 10,
                    frequency: 2,
                    score: 100,
                    spread: 2,
                    projects: ['A', 'B'],
                    occurrences: []
                }
            ],
            internal_duplicates: []
        };

        try {
            await notifier.notify(dummyReport);
            if (!receivedData) {
                console.error('FAIL: Webhook did not receive data');
                process.exit(1);
            }
            if (receivedData.text && receivedData.text.includes('1 cross-project leaks detected')) {
                console.log('PASS: Webhook notifier sent text payload successfully');
            } else if (receivedData.cross_project_leaks === 1) {
                console.log('PASS: Webhook notifier sent JSON payload successfully');
            } else {
                console.error(`FAIL: Unexpected payload structure`, receivedData);
                process.exit(1);
            }

            console.log('All notifier tests passed.');
            server.close();
            process.exit(0);
        } catch (err) {
            console.error('FAIL: Webhook notifier threw an error', err);
            server.close();
            process.exit(1);
        }
    });
}

runTests();
