import * as http from 'http';
import * as https from 'https';
import { DryDockReport } from './types';

export interface INotifier {
    notify(report: DryDockReport): Promise<void>;
}

export async function sendWebhook(url: string, payloadObject: any): Promise<void> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const requestModule = isHttps ? https : http;

        const payload = JSON.stringify(payloadObject);

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

export class WebhookNotifier implements INotifier {
    constructor(private url: string) {}

    async notify(report: DryDockReport): Promise<void> {
        const crossLeaksCount = report.cross_project_leakage.length;
        const internalCount = report.internal_duplicates.length;

        // Format compatible with Slack and standard webhooks
        const payload = {
            text: `DryDock Scan Complete: ${crossLeaksCount} cross-project leaks detected.`,
            cross_project_leaks: crossLeaksCount,
            internal_duplicates: internalCount
        };

        return sendWebhook(this.url, payload);
    }
}

export class ProjectWebhookNotifier implements INotifier {
    constructor(private projectWebhooks: { [project: string]: string }) {}

    async notify(report: DryDockReport): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const [project, url] of Object.entries(this.projectWebhooks)) {
            // Filter the report for this specific project
            const crossLeaksCount = report.cross_project_leakage.filter(leak => leak.projects.includes(project)).length;
            const internalCount = report.internal_duplicates.filter(dup => dup.project === project).length;

            // Only notify if there's actual leakage for this project
            if (crossLeaksCount > 0 || internalCount > 0) {
                const payload = {
                    text: `DryDock Scan Complete for ${project}: ${crossLeaksCount} cross-project leaks and ${internalCount} internal duplicates detected.`,
                    cross_project_leaks: crossLeaksCount,
                    internal_duplicates: internalCount
                };
                promises.push(sendWebhook(url, payload).catch(err => {
                    console.error(`Failed to send webhook for project ${project} to ${url}:`, err.message);
                }));
            }
        }

        await Promise.all(promises);
    }
}
