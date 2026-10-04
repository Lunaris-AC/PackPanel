import fs from 'fs';
import path from 'path';
import yauzl from 'yauzl';
import { query } from '../../db';
import { sanitizeRelativePath } from '../../storage/paths';
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
  const { endpointId, userId, mode, stripRootFolder = false } = payload;
  const zipFilePath = payload.zipFilePath || payload.zipPath;

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
  const entriesToExtract: Array<{ entry: yauzl.Entry; cleanPath: string; isDir: boolean }> = [];

  const inspectPromise = new Promise<void>((resolve, reject) => {
    zipfile.readEntry();

    zipfile.on('entry', (entry: yauzl.Entry) => {
      entryCount++;
      if (entryCount > config.MAX_ZIP_ENTRY_COUNT) {
        return reject(new Error(`L'archive dépasse la limite maximale de ${config.MAX_ZIP_ENTRY_COUNT} entrées (protection zip bomb).`));
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > config.MAX_ZIP_EXTRACT_SIZE_MIB * 1024 * 1024) {
        return reject(new Error(`La taille décompressée dépasse la limite de ${config.MAX_ZIP_EXTRACT_SIZE_MIB} Mio (protection zip bomb).`));
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
        }
      }

      const isDir = /\/$/.test(fileName);
      zipfile.readEntry();
    });

    zipfile.on('end', () => resolve());
    zipfile.on('error', (err) => reject(err));
  });

  await inspectPromise;

  // Check if this is an export manifest without binaries
  if ((hasManifestJson || hasModrinthJson) && !hasRealMods) {
    throw new Error(
      `L'archive fournie est un export de launcher (CurseForge/Modrinth) contenant uniquement un manifeste sans les binaires des mods. PackPanel requiert les vrais fichiers du modpack (dossiers mods/, config/, etc.).`
    );
  }

  // Second pass: extract and store files
  const zipfile2 = await openZip(zipFilePath);
  const stagingSessionDir = path.join(UPLOADS_DIR, `zip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
  fs.mkdirSync(stagingSessionDir, { recursive: true, mode: 0o750 });

  // Create an upload_session for this zip import
  const sessionRes = payload.sessionId ? await query('SELECT id FROM upload_sessions WHERE id = $1 AND endpoint_id = $2', [payload.sessionId, endpointId]) : await query(
    `INSERT INTO upload_sessions (endpoint_id, user_id, mode, status, expected_files_count, expires_at)
     VALUES ($1, $2, $3, 'processing', 0, NOW() + INTERVAL '24 hours')
     RETURNING id`,
    [endpointId, userId, mode]
  );
  if (!sessionRes.rows.length) throw new Error('Session d’import introuvable.');
  const sessionId = sessionRes.rows[0].id;

  const validEntries: Array<{ cleanPath: string; isDir: boolean; sha256: string; sha1: string; size: number }> = [];

  const extractPromise = new Promise<void>((resolve, reject) => {
    zipfile2.readEntry();

    zipfile2.on('entry', (entry: yauzl.Entry) => {
      let rawPath = entry.fileName.replace(/\\+/g, '/');

      // Strip common root if requested and valid
      if (stripRootFolder && commonPrefix && rawPath.startsWith(commonPrefix)) {
        rawPath = rawPath.substring(commonPrefix.length);
      }

      if (!rawPath || rawPath === '' || rawPath === '/') {
        zipfile2.readEntry();
        return;
      }

      const isDir = /\/$/.test(rawPath);
      const validation = sanitizeRelativePath(rawPath, isDir);
      if (!validation.valid || !validation.normalizedPath) {
        // Skip illegal or root entries safely
        zipfile2.readEntry();
        return;
      }

      const cleanPath = validation.normalizedPath;

      if (isDir) {
        validEntries.push({ cleanPath, isDir: true, sha256: '', sha1: '', size: 0 });
        zipfile2.readEntry();
        return;
      }

      // Extract file to staging
      const tempEntryPath = path.join(stagingSessionDir, `e_${Math.random().toString(36).substring(2, 10)}`);
      zipfile2.openReadStream(entry, (err, readStream) => {
        if (err || !readStream) {
          return reject(err || new Error(`Impossible d'extraire ${cleanPath}`));
        }

        const writeStream = fs.createWriteStream(tempEntryPath);
        readStream.pipe(writeStream);

        writeStream.on('finish', async () => {
          try {
            // Store directly in CAS
            const casObj = await storeObjectFromPath(tempEntryPath);
            validEntries.push({
              cleanPath,
              isDir: false,
              sha256: casObj.sha256,
              sha1: casObj.sha1,
              size: casObj.sizeBytes
            });
            zipfile2.readEntry();
          } catch (e) {
            reject(e);
          }
        });

        writeStream.on('error', (err) => reject(err));
      });
    });

    zipfile2.on('end', () => resolve());
    zipfile2.on('error', (err) => reject(err));
  });

  await extractPromise;

  // Insert upload_files
  for (const item of validEntries) {
    if (!item.isDir) {
      await query(
        `INSERT INTO upload_files (session_id, relative_path, expected_size, received_size, sha256, sha1, status)
         VALUES ($1, $2, $3, $3, $4, $5, 'verified')
         ON CONFLICT (session_id, relative_path) DO NOTHING`,
        [sessionId, item.cleanPath, item.size, item.sha256, item.sha1]
      );
    }
  }

  // Update session
  const fileCount = validEntries.filter(e => !e.isDir).length;
  const totalBytes = validEntries.reduce((sum, e) => sum + e.size, 0);

  await query(
    `UPDATE upload_sessions
     SET expected_files_count = $1,
         total_files = $1,
         processed_files = $1,
         received_files_count = $1,
         total_bytes_expected = $2,
         total_bytes_received = $2,
         status = 'sealed'
     WHERE id = $3`,
    [fileCount, totalBytes, sessionId]
  );

  // Clean staging
  try {
    fs.rmSync(stagingSessionDir, { recursive: true, force: true });
    if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
  } catch (e) {
    // ignore
  }

  // Enqueue build and publish release
  await JobQueue.enqueue('seal_and_build_release', { sessionId });
}
