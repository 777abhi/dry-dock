import * as http from 'http';
import { spawn } from 'child_process';
import * as path from 'path';

function runApiTests() {
    console.log("Testing REST API mode (--api-only) and CORS...");

    // Start drydock with --api-only
    const drydockProcess = spawn('npx', ['ts-node', path.join(__dirname, '../src/drydock.ts'), '--api-only'], {
        env: { ...process.env, PORT: '0' } // Use dynamic port to avoid collision
    });

    let stdoutData = '';
    let portMatch: RegExpMatchArray | null = null;
    let testsCompleted = false;

    // Set a timeout to kill the process if something hangs
    const timeout = setTimeout(() => {
        if (!testsCompleted) {
            console.error("FAIL: API test timed out waiting for server to start.");
            drydockProcess.kill();
            process.exit(1);
        }
    }, 10000);

    drydockProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();

        // Wait for server to output port
        if (!portMatch) {
            // Regex to find 'launched at http://localhost:<port>'
            portMatch = stdoutData.match(/http:\/\/localhost:(\d+)/);
            if (portMatch) {
                const port = parseInt(portMatch[1], 10);
                console.log(`Server started on dynamic port ${port}. Running API assertions...`);
                runAssertions(port);
            }
        }
    });

    drydockProcess.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
    });

    function runAssertions(port: number) {
        // Test 1: OPTIONS request for CORS
        const optionsReq = http.request({
            hostname: 'localhost',
            port: port,
            path: '/api/data',
            method: 'OPTIONS',
            headers: { 'Origin': 'http://external-tool.com' }
        }, (res) => {
            let passedOptions = false;
            try {
                if (res.headers['access-control-allow-origin'] !== '*') {
                    throw new Error(`Missing or incorrect Access-Control-Allow-Origin: ${res.headers['access-control-allow-origin']}`);
                }
                if (!res.headers['access-control-allow-methods']) {
                    throw new Error('Missing Access-Control-Allow-Methods');
                }
                passedOptions = true;
                console.log("PASS: Preflight OPTIONS request returned CORS headers.");
            } catch (err: any) {
                console.error(`FAIL: ${err.message}`);
                finishTest(1);
                return;
            }

            // Test 2: GET request for CORS and Data
            if (passedOptions) {
                http.get(`http://localhost:${port}/api/data`, (getRes) => {
                    try {
                        if (getRes.headers['access-control-allow-origin'] !== '*') {
                            throw new Error(`Missing or incorrect Access-Control-Allow-Origin on GET request: ${getRes.headers['access-control-allow-origin']}`);
                        }

                        let data = '';
                        getRes.on('data', chunk => data += chunk);
                        getRes.on('end', () => {
                            const report = JSON.parse(data);
                            if (!report.internal_duplicates || !report.cross_project_leakage) {
                                throw new Error('Invalid JSON structure returned from /api/data');
                            }
                            console.log("PASS: GET /api/data returned valid JSON and CORS headers.");
                            finishTest(0);
                        });
                    } catch (err: any) {
                        console.error(`FAIL: ${err.message}`);
                        finishTest(1);
                    }
                }).on('error', (err) => {
                    console.error("FAIL: GET request error", err);
                    finishTest(1);
                });
            }
        });

        optionsReq.on('error', (err) => {
            console.error("FAIL: OPTIONS request error", err);
            finishTest(1);
        });

        optionsReq.end();
    }

    function finishTest(code: number) {
        testsCompleted = true;
        clearTimeout(timeout);
        drydockProcess.kill();
        if (code === 0) {
            console.log("All API tests passed.");
        }
        process.exit(code);
    }
}

try {
    runApiTests();
} catch (e) {
    console.error("FAIL: API tests threw unhandled exception", e);
    process.exit(1);
}
