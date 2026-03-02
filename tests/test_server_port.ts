import * as http from 'http';
import { exec } from 'child_process';
import * as path from 'path';

async function testServerPort() {
    console.log("Testing dynamic server port via PORT env...");

    // Start the dashboard server in a child process on a non-default port
    const scriptPath = path.join(__dirname, '..', 'src', 'drydock.ts');
    const customPort = 3001;
    const env = { ...process.env, PORT: customPort.toString() };
    const child = exec(`npx ts-node ${scriptPath} scan . --open`, { env });

    // Wait for the server to start using a retry mechanism
    let isServerUp = false;
    for (let i = 0; i < 20; i++) {
        try {
            await new Promise<void>((resolve, reject) => {
                http.get(`http://localhost:${customPort}`, (res) => {
                    resolve();
                }).on('error', reject);
            });
            isServerUp = true;
            break;
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    let hasError = false;

    if (!isServerUp) {
        console.error(`FAIL: Dashboard server failed to start on custom port ${customPort}.`);
        hasError = true;
    } else {
        console.log(`PASS: Dashboard server started successfully on custom port ${customPort}.`);
    }

    if (child.pid) {
        try { process.kill(child.pid); } catch (e) {}
        try { child.kill('SIGTERM'); } catch (e) {}
    }

    process.exit(hasError ? 1 : 0);
}

testServerPort();
