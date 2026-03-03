import * as http from 'http';
import { exec } from 'child_process';
import * as path from 'path';

async function testDynamicServerPort() {
    console.log("Testing dynamic server port via PORT=0 env...");

    const scriptPath = path.join(__dirname, '..', 'src', 'drydock.ts');
    const env = { ...process.env, PORT: '0' };
    const child = exec(`npx ts-node ${scriptPath} scan . --open`, { env });

    let allocatedPort: number | null = null;
    let hasError = false;

    // Listen to stdout to grab the allocated port
    let outputBuffer = '';
    child.stdout?.on('data', (data: string) => {
        outputBuffer += data;
        if (allocatedPort === null) {
            const match = outputBuffer.match(/Dashboard successfully launched at http:\/\/localhost:(\d+)/);
            if (match && match[1]) {
                allocatedPort = parseInt(match[1], 10);
            }
        }
    });

    // Wait for the server to start using a retry mechanism and the detected port
    let isServerUp = false;
    for (let i = 0; i < 40; i++) {
        if (allocatedPort !== null && allocatedPort > 0) {
            try {
                await new Promise<void>((resolve, reject) => {
                    http.get(`http://localhost:${allocatedPort}`, (res) => {
                        resolve();
                    }).on('error', reject);
                });
                isServerUp = true;
                break;
            } catch (e) {
                // Ignore and retry
            }
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!isServerUp) {
        console.error(`FAIL: Dashboard server failed to start dynamically or failed to report the allocated port.`);
        hasError = true;
    } else {
        console.log(`PASS: Dashboard server started successfully on dynamic port ${allocatedPort}.`);
    }

    if (child.pid) {
        try { process.kill(child.pid); } catch (e) {}
        try { child.kill('SIGTERM'); } catch (e) {}
    }

    process.exit(hasError ? 1 : 0);
}

testDynamicServerPort();
