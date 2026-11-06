import fs from 'fs';
import path from 'path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import yauzl from 'yauzl';
import { query, withTransaction } from '../../db';
import { isPublicPackPath, sanitizeRelativePath } from '../../storage/paths';
import { storeObjectFromPath } from '../../storage/cas';
import { config, UPLOADS_DIR } from '../../config';
import { JobQueue } from '../queue';

export interface ExtractZipPayload {
  zipFilePath?: string;
  zipPath?: string;
  sessionId?: string;
  endpointId: string;
  userId?: string;
  mode: 'add_replace' | 'full_replace';
  stripRootFolder?: boolean;
  immediatePublish?: boolean;
}

export function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return reject(err);
      resolve(zipfile);
    });
  });
}

export async function handleExtractZipImport(payload: ExtractZipPayload): Promise<void> {
  const { endpointId, userId, mode, stripRootFolder = false, immediatePublish } = payload;
  const zipFilePath = payload.zipFilePath || payload.zipPath;
  if (payload.sessionId) {
    const session = await query('SELECT status FROM upload_sessions WHERE id = $1 AND endpoint_id = $2', [payload.sessionId, endpointId]);
    if (!session.rows.length) throw new Error('Session d’import introuvable.');
    if (['sealed', 'completed'].includes(session.rows[0].status)) {
      if (zipFilePath) await fs.promises.rm(zipFilePath, { force: true }).catch(() => {});
      return;
    }
  }

  if (!zipFilePath || !fs.existsSync(zipFilePath)) {
    throw new Error(`Archive ZIP introuvable : ${zipFilePath}`);
  }

  const zipfile = await openZip(zipFilePath);

  // First pass: inspect archive security and detect CurseForge / Modrinth manifest-only zips
  let totalUncompressedBytes = 0;
  let entryCount = 0;
  let hasManifestJson = false;
  let hasModrinthJson = false;
  let hasRealMods = false;
  let commonPrefix: string | null = null;
  try {
    for await (const entry of zipfile.eachEntry()) {
      entryCount++;
      if (entryCount > config.MAX_ZIP_ENTRY_COUNT) {
        throw new Error(`L'archive dépasse la limite maximale de ${config.MAX_ZIP_ENTRY_COUNT} entrées (protection zip bomb).`);
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > config.MAX_ZIP_EXTRACT_SIZE_MIB * 1024 * 1024) {
        throw new Error(`La taille décompressée dépasse la limite de ${config.MAX_ZIP_EXTRACT_SIZE_MIB} Mio (protection zip bomb).`);
      }

      const fileName = entry.fileName.replace(/\\+/g, '/');

      // Check CurseForge or Modrinth launcher exports
      if (fileName === 'manifest.json') hasManifestJson = true;
      if (fileName === 'modrinth.index.json') hasModrinthJson = true;
      if (fileName.startsWith('mods/') && fileName.endsWith('.jar')) hasRealMods = true;

      // Detect common root folder
      if (stripRootFolder) {
        const firstSlash = fileName.indexOf('/');
        if (firstSlash !== -1) {
          const rootFolder = fileName.substring(0, firstSlash + 1);
          if (commonPrefix === null) {
            commonPrefix = rootFolder;
          } else if (commonPrefix !== rootFolder) {
            commonPrefix = ''; // multiple root folders
          }
        } else commonPrefix = '';
      }
    }
  } finally {
    zipfile.close();
  }

  // Check if this is an export manifest without binaries
  if ((hasManifestJson || hasModrinthJson) && !hasRealMods) {
    throw new Error(
      `L'archive fournie est un export de launcher (CurseForge/Modrinth) contenant uniquement un manifeste sans les binaires des mods. PackPanel requiert les vrais fichiers du modpack (dossiers mods/, config/, etc.).`
    );
  }

  // Create an upload_session for this zip import
  const sessionRes = payload.sessionId ? await query('SELECT id FROM upload_sessions WHERE id = $1 AND endpoint_id = $2', [payload.sessionId, endpointId]) : await query(
    `INSERT INTO upload_sessions (endpoint_id, user_id, mode, status, expected_files_count, expires_at)
     VALUES ($1, $2, $3, 'processing', 0, NOW() + INTERVAL '24 hours')
     RETURNING id`,
    [endpointId, userId, mode]
  );
  if (!sessionRes.rows.length) throw new Error('Session d’import introuvable.');
  const sessionId = sessionRes.rows[0].id;

  const validEntries: Array<{ cleanPath: string; sha256: string; sha1: string; sizeBytes: number }> = [];
  const seen = new Set<string>();
  const stagingSessionDir = await fs.promises.mkdtemp(path.join(UPLOADS_DIR, 'zip_'));
  const extraction = await openZip(zipFilePath).catch(async error => {
    await fs.promises.rm(stagingSessionDir, { recursive: true, force: true });
    throw error;
  });
  try {
    for await (const entry of extraction.eachEntry()) {
      let rawPath = entry.fileName.replace(/\\+/g, '/');

      // Strip common root if requested and valid
      if (stripRootFolder && commonPrefix && rawPath.startsWith(commonPrefix)) {
        rawPath = rawPath.substring(commonPrefix.length);
      }

      if (!rawPath || rawPath.endsWith('/')) continue;
      const validation = sanitizeRelativePath(rawPath);
      if (!validation.valid || !validation.normalizedPath) throw new Error(validation.error ?? 'Chemin ZIP invalide');
      const cleanPath = validation.normalizedPath;
      if (!isPublicPackPath(cleanPath)) continue;
      const normalized = cleanPath.toLowerCase();
      if (seen.has(normalized)) throw new Error(`L'archive contient plusieurs fichiers au chemin "${cleanPath}".`);
      seen.add(normalized);

      const tempEntryPath = path.join(stagingSessionDir, randomUUID());
      await pipeline(await extraction.openReadStreamPromise(entry), fs.createWriteStream(tempEntryPath));
      const stored = await storeObjectFromPath(tempEntryPath);
      validEntries.push({ cleanPath, ...stored });
    }
  } finally {
    extraction.close();
    await fs.promises.rm(stagingSessionDir, { recursive: true, force: true });
  }
  if (!validEntries.length) throw new Error("L’archive ZIP ne contient aucun fichier.");

  await withTransaction(async client => {
    for (const item of validEntries) {
      await client.query(
        `INSERT INTO upload_files (session_id, relative_path, expected_size, received_size, sha256, sha1, status)
         VALUES ($1, $2, $3, $3, $4, $5, 'verified')
         ON CONFLICT (session_id, relative_path) DO NOTHING`,
        [sessionId, item.cleanPath, item.sizeBytes, item.sha256, item.sha1]
      );
    }
    const totalBytes = validEntries.reduce((sum, item) => sum + item.sizeBytes, 0);
    await client.query(
    `UPDATE upload_sessions
     SET expected_files_count = $1,
         total_files = $1,
         processed_files = $1,
         received_files_count = $1,
         total_bytes_expected = $2,
         total_bytes_received = $2,
         status = 'sealed'
     WHERE id = $3`,
      [validEntries.length, totalBytes, sessionId]
    );
    await JobQueue.enqueue('seal_and_build_release', { sessionId, immediatePublish }, 0, 3, client.query.bind(client) as typeof query);
  });
  await fs.promises.rm(zipFilePath, { force: true }).catch(() => {});
}
