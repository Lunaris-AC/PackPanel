import os from 'os';
import fs from 'fs';
import { JobQueue } from './jobs/queue';
import { handleProcessUploadFile } from './jobs/handlers/hash';
import { handleSealAndBuildRelease, handlePublishRelease } from './jobs/handlers/publish';
import { handleExtractZipImport } from './jobs/handlers/zip';
import { handleGarbageCollection } from './jobs/handlers/gc';
import { handleScanIncomingFolder } from './jobs/handlers/watch';
import { query } from './db';
import { OBJECTS_DIR, UPLOADS_DIR, ENDPOINTS_DIR, BACKUPS_DIR, reloadPublicConfiguration } from './config';

const workerId = `worker_${os.hostname()}_${process.pid}`;
let isRunning = true;

// Ensure directories exist
for (const dir of [OBJECTS_DIR, UPLOADS_DIR, BACKUPS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  }
}
// Nginx serves only this public subtree; private objects/uploads remain restricted.
fs.mkdirSync(ENDPOINTS_DIR, { recursive: true, mode: 0o755 });
fs.chmodSync(ENDPOINTS_DIR, 0o755);

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
        await JobQueue.enqueue('gc_orphan_objects', {});
      }

      // 2. Periodic incoming folder check every 30 seconds
      if (Date.now() - lastWatchScan > 30 * 1000) {
        reloadPublicConfiguration();
        lastWatchScan = Date.now();
        const activeEndpoints = await query(`SELECT id, slug FROM endpoints WHERE is_active = TRUE`);
        for (const ep of activeEndpoints.rows) {
          await JobQueue.enqueue('scan_incoming_folder', { endpointId: ep.id, slug: ep.slug });
        }
      }

      // 3. Fetch next job
      const job = await JobQueue.fetchNext(workerId);
      if (!job) {
        // No pending jobs, sleep 1 second
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      console.log(`[Worker] Processing job ${job.id} (${job.type})...`);

      // Heartbeat interval
      const heartbeatTimer = setInterval(async () => {
        try {
          await JobQueue.heartbeat(job.id, workerId);
        } catch (e) {
          // ignore
        }
      }, 30000);

      try {
        switch (job.type) {
          case 'process_upload_file':
            await handleProcessUploadFile(job.payload);
            break;
          case 'seal_and_build_release':
            await handleSealAndBuildRelease(job.payload);
            break;
          case 'publish_release':
            await handlePublishRelease(job.payload);
            break;
          case 'extract_zip_import':
            await handleExtractZipImport(job.payload);
            break;
          case 'gc_orphan_objects':
            await handleGarbageCollection();
            break;
          case 'scan_incoming_folder':
            await handleScanIncomingFolder(job.payload);
            break;
          default:
            throw new Error(`Unknown job type: ${job.type}`);
        }

        clearInterval(heartbeatTimer);
        await JobQueue.complete(job.id);
        console.log(`[Worker] Completed job ${job.id}`);
      } catch (err: any) {
        clearInterval(heartbeatTimer);
        console.error(`[Worker] Job ${job.id} failed:`, err.message || err);
        await JobQueue.fail(job.id, err.message || String(err));
      }
    } catch (err) {
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
