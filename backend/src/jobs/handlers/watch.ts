import fs from 'fs';
import path from 'path';
import { query } from '../../db';
import { ENDPOINTS_DIR } from '../../config';
import { sanitizeRelativePath } from '../../storage/paths';
import { storeObjectFromPath } from '../../storage/cas';
import { JobQueue } from '../queue';

const CONTROL_FILES = new Set(['.ready', '.seal', '.git', '.DS_Store', 'Thumbs.db']);

export async function handleScanIncomingFolder(payload: { endpointId: string; slug: string }): Promise<void> {
  const { endpointId, slug } = payload;
  const incomingDir = path.join(ENDPOINTS_DIR, slug, 'incoming');

  if (!fs.existsSync(incomingDir)) {
    fs.mkdirSync(incomingDir, { recursive: true, mode: 0o750 });
    return;
  }

  // Look for subfolders or a top-level .ready marker
  const entries = fs.readdirSync(incomingDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const batchDir = path.join(incomingDir, entry.name);
      const markerPath = path.join(batchDir, '.ready');
      const sealPath = path.join(batchDir, '.seal');

      // Only process sealed batches! A silent directory is never assumed complete without a marker
      if (fs.existsSync(markerPath) || fs.existsSync(sealPath)) {
        await processSealedBatch(endpointId, slug, batchDir);
      }
    }
  }

  // Check if incomingDir itself has a .ready marker
  const rootMarker = path.join(incomingDir, '.ready');
  if (fs.existsSync(rootMarker)) {
    await processSealedBatch(endpointId, slug, incomingDir, true);
  }
}

async function processSealedBatch(
  endpointId: string,
  slug: string,
  batchDir: string,
  isRoot: boolean = false
): Promise<void> {
  console.log(`Processing sealed batch in ${batchDir} for endpoint ${slug}`);

  // Fetch admin user ID for attribution
  const adminRes = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  const adminId = adminRes.rows[0]?.id;

  // Create an upload_session
  const sessionRes = await query(
    `INSERT INTO upload_sessions (endpoint_id, user_id, mode, status, expected_files_count, expires_at)
     VALUES ($1, $2, 'add_replace', 'processing', 0, NOW() + INTERVAL '24 hours')
     RETURNING id`,
    [endpointId, adminId]
  );
  const sessionId = sessionRes.rows[0].id;

  const collectedFiles: Array<{ relPath: string; fullPath: string; size: number }> = [];

  function walk(currentDir: string, relBase: string = '') {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const it of items) {
      if (CONTROL_FILES.has(it.name)) continue;

      const subRel = relBase ? `${relBase}/${it.name}` : it.name;
      const subFull = path.join(currentDir, it.name);

      if (it.isDirectory()) {
        walk(subFull, subRel);
      } else if (it.isFile()) {
        const validation = sanitizeRelativePath(subRel);
        if (validation.valid && validation.normalizedPath) {
          collectedFiles.push({
            relPath: validation.normalizedPath,
            fullPath: subFull,
            size: fs.statSync(subFull).size
          });
        }
      }
    }
  }

  walk(batchDir);

  if (collectedFiles.length === 0) {
    console.log(`Batch ${batchDir} is empty, skipping.`);
    if (!isRoot) {
      fs.rmSync(batchDir, { recursive: true, force: true });
    } else {
      const rootMarker = path.join(batchDir, '.ready');
      if (fs.existsSync(rootMarker)) fs.unlinkSync(rootMarker);
    }
    return;
  }

  // Ingest files into CAS
  for (const f of collectedFiles) {
    // Copy into a temporary file to keep producer directory decoupled
    const tempCopy = `${f.fullPath}.ingest_${Date.now()}`;
    fs.copyFileSync(f.fullPath, tempCopy);
    const casObj = await storeObjectFromPath(tempCopy);

    await query(
      `INSERT INTO upload_files (session_id, relative_path, expected_size, received_size, sha256, sha1, status)
       VALUES ($1, $2, $3, $3, $4, $5, 'verified')
       ON CONFLICT (session_id, relative_path) DO NOTHING`,
      [sessionId, f.relPath, f.size, casObj.sha256, casObj.sha1]
    );
  }

  const totalBytes = collectedFiles.reduce((acc, f) => acc + f.size, 0);

  await query(
    `UPDATE upload_sessions
     SET expected_files_count = $1,
         received_files_count = $1,
         total_bytes_expected = $2,
         total_bytes_received = $2,
         status = 'sealed'
     WHERE id = $3`,
    [collectedFiles.length, totalBytes, sessionId]
  );

  // Clean processed batch
  if (!isRoot) {
    fs.rmSync(batchDir, { recursive: true, force: true });
  } else {
    const rootMarker = path.join(batchDir, '.ready');
    if (fs.existsSync(rootMarker)) fs.unlinkSync(rootMarker);
  }

  // Enqueue build and publish
  await JobQueue.enqueue('seal_and_build_release', { sessionId });
}
