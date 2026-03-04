import * as http from 'http';
import * as https from 'https';
import { DryDockReport } from './types';

export interface INotifier {
    notify(report: DryDockReport): Promise<void>;
}

export class WebhookNotifier implements INotifier {
    constructor(private url: string) {}

    async notify(report: DryDockReport): Promise<void> {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(this.url);
            const isHttps = parsedUrl.protocol === 'https:';
            const requestModule = isHttps ? https : http;

            const crossLeaksCount = report.cross_project_leakage.length;
            const internalCount = report.internal_duplicates.length;

            // Format compatible with Slack and standard webhooks
            const payload = JSON.stringify({
                text: `DryDock Scan Complete: ${crossLeaksCount} cross-project leaks detected.`,
                cross_project_leaks: crossLeaksCount,
                internal_duplicates: internalCount
            });

            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const req = requestModule.request(options, (res) => {
                let body = '';
                res.on('data', chunk => {
                    body += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Webhook failed with status ${res.statusCode}: ${body}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(payload);
            req.end();
        });
    }
}
