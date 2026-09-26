import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../../db';
import { config, ENDPOINTS_DIR } from '../../config';
import { linkObjectToRelease } from '../../storage/cas';
import { buildMineLaunchedManifest, validateMineLaunchedContract, FileRecordInput } from '../../storage/manifest';

export interface SealAndBuildReleasePayload {
  sessionId: string;
}

export interface PublishReleasePayload {
  releaseId: string;
  endpointId: string;
}

export async function handleSealAndBuildRelease(payload: SealAndBuildReleasePayload): Promise<void> {
  const { sessionId } = payload;

  const sessionRes = await query(
    `SELECT s.*, e.slug as endpoint_slug, e.cleanup_rules, e.auto_publish
     FROM upload_sessions s
     JOIN endpoints e ON e.id = s.endpoint_id
     WHERE s.id = $1`,
    [sessionId]
  );

  if (sessionRes.rows.length === 0) {
    throw new Error(`Session d'upload introuvable : ${sessionId}`);
  }

  const session = sessionRes.rows[0];
  const endpointId = session.endpoint_id;
  const endpointSlug = session.endpoint_slug;
  const cleanupRules: string[] = session.cleanup_rules || ['mods'];

  // Check if session has failed files
  const failedFiles = await query(
    `SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status = 'failed'`,
    [sessionId]
  );
  if (parseInt(failedFiles.rows[0].count, 10) > 0) {
    throw new Error(`La session comporte des fichiers en erreur. Publication annulée.`);
  }

  // Get active release for base merging if in add_replace mode
  const activeReleaseRes = await query(
    `SELECT id, release_id, version_num FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1`,
    [endpointId]
  );
  const activeRelease = activeReleaseRes.rows[0] || null;

  // Determine next version number and release_id
  const maxVersionRes = await query(
    `SELECT COALESCE(MAX(version_num), 0) + 1 as next_version FROM releases WHERE endpoint_id = $1`,
    [endpointId]
  );
  const nextVersionNum = parseInt(maxVersionRes.rows[0].next_version, 10);
  const releaseIdStr = `r${String(nextVersionNum).padStart(4, '0')}`;

  // Assemble files map: relativePath -> { sha256, sha1, sizeBytes, isDir }
  const filesMap = new Map<string, { sha256: string; sha1: string; sizeBytes: number; isDir: boolean }>();

  // If add_replace mode, start with all files from the active release
  if (session.mode === 'add_replace' && activeRelease) {
    const existingFiles = await query(
      `SELECT relative_path, sha256, sha1, size_bytes, is_dir FROM release_files WHERE release_id = $1`,
      [activeRelease.id]
    );
    for (const f of existingFiles.rows) {
      filesMap.set(f.relative_path, {
        sha256: f.sha256,
        sha1: f.sha1,
        sizeBytes: Number(f.size_bytes),
        isDir: f.is_dir
      });
    }
  }

  // Apply new files from the upload session
  const uploadedFiles = await query(
    `SELECT relative_path, sha256, sha1, received_size FROM upload_files WHERE session_id = $1 AND status = 'verified'`,
    [sessionId]
  );
  for (const uf of uploadedFiles.rows) {
    filesMap.set(uf.relative_path, {
      sha256: uf.sha256,
      sha1: uf.sha1,
      sizeBytes: Number(uf.received_size),
      isDir: false
    });
  }

  if (filesMap.size === 0) {
    throw new Error(`Garde-fou : la version résultante est entièrement vide. Publication annulée.`);
  }

  // Create physical release directory: <DATA_DIR>/storage/endpoints/<slug>/releases/<release_id>/
  const releaseDir = path.join(ENDPOINTS_DIR, endpointSlug, 'releases', releaseIdStr);
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true, mode: 0o755 });
  }

  // Link files from CAS to release directory
  const manifestInput: FileRecordInput[] = [];
  let totalBytes = 0;

  for (const [relPath, fileInfo] of filesMap.entries()) {
    if (!fileInfo.isDir) {
      const destPath = path.join(releaseDir, relPath);
      linkObjectToRelease(fileInfo.sha256, destPath);
      totalBytes += fileInfo.sizeBytes;
    }
    manifestInput.push({
      relativePath: relPath,
      sha1: fileInfo.sha1,
      isDir: fileInfo.isDir
    });
  }

  // Build and validate MineLaunched manifest
  const manifestData = buildMineLaunchedManifest(
    manifestInput,
    endpointSlug,
    releaseIdStr,
    config.FILES_FQDN,
    cleanupRules
  );

  const validation = validateMineLaunchedContract(manifestData);
  if (!validation.valid) {
    throw new Error(`Contrat MineLaunched non respecté : ${validation.errors.join(', ')}`);
  }

  const manifestJson = JSON.stringify(manifestData, null, 2);
  const releaseManifestPath = path.join(releaseDir, 'manifest.json');
  fs.writeFileSync(releaseManifestPath, manifestJson, 'utf8');

  // Insert release into database
  const createdRelease = await withTransaction(async (client) => {
    const relRes = await client.query(
      `INSERT INTO releases (endpoint_id, release_id, version_num, status, is_active, is_pinned, created_by_user_id, manifest_content, total_files, total_bytes)
       VALUES ($1, $2, $3, 'draft', FALSE, FALSE, $4, $5, $6, $7)
       RETURNING id`,
      [
        endpointId,
        releaseIdStr,
        nextVersionNum,
        session.user_id,
        JSON.stringify(manifestData),
        filesMap.size,
        totalBytes
      ]
    );
    const newReleaseId = relRes.rows[0].id;

    for (const [relPath, fileInfo] of filesMap.entries()) {
      await client.query(
        `INSERT INTO release_files (release_id, relative_path, sha256, sha1, size_bytes, is_dir)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newReleaseId, relPath, fileInfo.isDir ? null : fileInfo.sha256, fileInfo.isDir ? null : fileInfo.sha1, fileInfo.sizeBytes, fileInfo.isDir]
      );
    }


    return newReleaseId;
  });

  // If auto-publish or direct publication is triggered
  await publishReleaseInternal(endpointId, createdRelease, endpointSlug, manifestJson, releaseDir);

  // Mark upload session as completed
  await query(
    `UPDATE upload_sessions SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

/**
 * Atomically publishes a release, updates index.php and database.
 */
export async function publishReleaseInternal(
  endpointId: string,
  releaseDbId: string,
  endpointSlug: string,
  manifestJson: string,
  releaseDir: string
): Promise<void> {
  const endpointDir = path.join(ENDPOINTS_DIR, endpointSlug);
  if (!fs.existsSync(endpointDir)) {
    fs.mkdirSync(endpointDir, { recursive: true, mode: 0o755 });
  }

  // 1. Write active manifest atomically: index.php.tmp -> index.php
  const activeManifestPath = path.join(endpointDir, 'index.php');
  const tempManifestPath = path.join(endpointDir, 'index.php.tmp');

  const fd = fs.openSync(tempManifestPath, 'w');
  fs.writeFileSync(fd, manifestJson, 'utf8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  fs.renameSync(tempManifestPath, activeManifestPath);

  // 2. Atomically update 'active' symlink to release directory
  const activeLink = path.join(endpointDir, 'active');
  const tempLink = path.join(endpointDir, 'active.tmp');
  try {
    if (fs.existsSync(tempLink)) fs.unlinkSync(tempLink);
    fs.symlinkSync(releaseDir, tempLink, 'junction');
    fs.renameSync(tempLink, activeLink);
  } catch (e) {
    // If symlink fails on non-unix, fallback to active link ignore
  }

  // 3. Update database transactions
  await withTransaction(async (client) => {
    // Deactivate previous active releases for this endpoint
    await client.query(
      `UPDATE releases SET is_active = FALSE WHERE endpoint_id = $1 AND is_active = TRUE`,
      [endpointId]
    );

    // Activate the new release
    await client.query(
      `UPDATE releases
       SET is_active = TRUE,
           status = 'published',
           published_at = NOW()
       WHERE id = $1`,
      [releaseDbId]
    );
  });
}
