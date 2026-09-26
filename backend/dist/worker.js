"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const queue_1 = require("./jobs/queue");
const hash_1 = require("./jobs/handlers/hash");
const publish_1 = require("./jobs/handlers/publish");
const zip_1 = require("./jobs/handlers/zip");
const gc_1 = require("./jobs/handlers/gc");
const watch_1 = require("./jobs/handlers/watch");
const db_1 = require("./db");
const config_1 = require("./config");
const workerId = `worker_${os_1.default.hostname()}_${process.pid}`;
let isRunning = true;
// Ensure directories exist
for (const dir of [config_1.OBJECTS_DIR, config_1.UPLOADS_DIR, config_1.ENDPOINTS_DIR, config_1.BACKUPS_DIR]) {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o750 });
    }
}
async function startWorker() {
    console.log(`[Worker] Started ${workerId}`);
    // Schedule background periodic jobs
    let lastGc = Date.now();
    let lastWatchScan = Date.now();
    while (isRunning) {
        try {
            // 1. Periodic GC every 6 hours
            if (Date.now() - lastGc > 6 * 3600 * 1000) {
                lastGc = Date.now();
                await queue_1.JobQueue.enqueue('gc_orphan_objects', {});
            }
            // 2. Periodic incoming folder check every 30 seconds
            if (Date.now() - lastWatchScan > 30 * 1000) {
                lastWatchScan = Date.now();
                const activeEndpoints = await (0, db_1.query)(`SELECT id, slug FROM endpoints WHERE is_active = TRUE`);
                for (const ep of activeEndpoints.rows) {
                    await queue_1.JobQueue.enqueue('scan_incoming_folder', { endpointId: ep.id, slug: ep.slug });
                }
            }
            // 3. Fetch next job
            const job = await queue_1.JobQueue.fetchNext(workerId);
            if (!job) {
                // No pending jobs, sleep 1 second
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            console.log(`[Worker] Processing job ${job.id} (${job.type})...`);
            // Heartbeat interval
            const heartbeatTimer = setInterval(async () => {
                try {
                    await queue_1.JobQueue.heartbeat(job.id, workerId);
                }
                catch (e) {
                    // ignore
                }
            }, 30000);
            try {
                switch (job.type) {
                    case 'process_upload_file':
                        await (0, hash_1.handleProcessUploadFile)(job.payload);
                        break;
                    case 'seal_and_build_release':
                        await (0, publish_1.handleSealAndBuildRelease)(job.payload);
                        break;
                    case 'extract_zip_import':
                        await (0, zip_1.handleExtractZipImport)(job.payload);
                        break;
                    case 'gc_orphan_objects':
                        await (0, gc_1.handleGarbageCollection)();
                        break;
                    case 'scan_incoming_folder':
                        await (0, watch_1.handleScanIncomingFolder)(job.payload);
                        break;
                    default:
                        console.warn(`[Worker] Unknown job type: ${job.type}`);
                }
                clearInterval(heartbeatTimer);
                await queue_1.JobQueue.complete(job.id);
                console.log(`[Worker] Completed job ${job.id}`);
            }
            catch (err) {
                clearInterval(heartbeatTimer);
                console.error(`[Worker] Job ${job.id} failed:`, err.message || err);
                await queue_1.JobQueue.fail(job.id, err.message || String(err));
            }
        }
        catch (err) {
            console.error('[Worker] Loop error:', err);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.log(`[Worker] Stopped ${workerId}`);
}
process.on('SIGTERM', () => {
    console.log('[Worker] Received SIGTERM, gracefully shutting down...');
    isRunning = false;
});
process.on('SIGINT', () => {
    console.log('[Worker] Received SIGINT, gracefully shutting down...');
    isRunning = false;
});
if (require.main === module) {
    startWorker();
}
//# sourceMappingURL=worker.js.map