"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSealAndBuildRelease = handleSealAndBuildRelease;
exports.publishReleaseInternal = publishReleaseInternal;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../db");
const config_1 = require("../../config");
const cas_1 = require("../../storage/cas");
const manifest_1 = require("../../storage/manifest");
async function handleSealAndBuildRelease(payload) {
    const { sessionId } = payload;
    const sessionRes = await (0, db_1.query)(`SELECT s.*, e.slug as endpoint_slug, e.cleanup_rules, e.auto_publish
     FROM upload_sessions s
     JOIN endpoints e ON e.id = s.endpoint_id
     WHERE s.id = $1`, [sessionId]);
    if (sessionRes.rows.length === 0) {
        throw new Error(`Session d'upload introuvable : ${sessionId}`);
    }
    const session = sessionRes.rows[0];
    const endpointId = session.endpoint_id;
    const endpointSlug = session.endpoint_slug;
    const cleanupRules = session.cleanup_rules || ['mods'];
    // Check if session has failed files
    const failedFiles = await (0, db_1.query)(`SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status = 'failed'`, [sessionId]);
    if (parseInt(failedFiles.rows[0].count, 10) > 0) {
        throw new Error(`La session comporte des fichiers en erreur. Publication annulée.`);
    }
    // Get active release for base merging if in add_replace mode
    const activeReleaseRes = await (0, db_1.query)(`SELECT id, release_id, version_num FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1`, [endpointId]);
    const activeRelease = activeReleaseRes.rows[0] || null;
    // Determine next version number and release_id
    const maxVersionRes = await (0, db_1.query)(`SELECT COALESCE(MAX(version_num), 0) + 1 as next_version FROM releases WHERE endpoint_id = $1`, [endpointId]);
    const nextVersionNum = parseInt(maxVersionRes.rows[0].next_version, 10);
    const releaseIdStr = `r${String(nextVersionNum).padStart(4, '0')}`;
    // Assemble files map: relativePath -> { sha256, sha1, sizeBytes, isDir }
    const filesMap = new Map();
    // If add_replace mode, start with all files from the active release
    if (session.mode === 'add_replace' && activeRelease) {
        const existingFiles = await (0, db_1.query)(`SELECT relative_path, sha256, sha1, size_bytes, is_dir FROM release_files WHERE release_id = $1`, [activeRelease.id]);
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
    const uploadedFiles = await (0, db_1.query)(`SELECT relative_path, sha256, sha1, received_size FROM upload_files WHERE session_id = $1 AND status = 'verified'`, [sessionId]);
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
    const releaseDir = path_1.default.join(config_1.ENDPOINTS_DIR, endpointSlug, 'releases', releaseIdStr);
    if (!fs_1.default.existsSync(releaseDir)) {
        fs_1.default.mkdirSync(releaseDir, { recursive: true, mode: 0o755 });
    }
    // Link files from CAS to release directory
    const manifestInput = [];
    let totalBytes = 0;
    for (const [relPath, fileInfo] of filesMap.entries()) {
        if (!fileInfo.isDir) {
            const destPath = path_1.default.join(releaseDir, relPath);
            (0, cas_1.linkObjectToRelease)(fileInfo.sha256, destPath);
            totalBytes += fileInfo.sizeBytes;
        }
        manifestInput.push({
            relativePath: relPath,
            sha1: fileInfo.sha1,
            isDir: fileInfo.isDir
        });
    }
    // Build and validate MineLaunched manifest
    const manifestData = (0, manifest_1.buildMineLaunchedManifest)(manifestInput, endpointSlug, releaseIdStr, config_1.config.FILES_FQDN, cleanupRules);
    const validation = (0, manifest_1.validateMineLaunchedContract)(manifestData);
    if (!validation.valid) {
        throw new Error(`Contrat MineLaunched non respecté : ${validation.errors.join(', ')}`);
    }
    const manifestJson = JSON.stringify(manifestData, null, 2);
    const releaseManifestPath = path_1.default.join(releaseDir, 'manifest.json');
    fs_1.default.writeFileSync(releaseManifestPath, manifestJson, 'utf8');
    // Insert release into database
    const createdRelease = await (0, db_1.withTransaction)(async (client) => {
        const relRes = await client.query(`INSERT INTO releases (endpoint_id, release_id, version_num, status, is_active, is_pinned, created_by_user_id, manifest_content, total_files, total_bytes)
       VALUES ($1, $2, $3, 'draft', FALSE, FALSE, $4, $5, $6, $7)
       RETURNING id`, [
            endpointId,
            releaseIdStr,
            nextVersionNum,
            session.user_id,
            JSON.stringify(manifestData),
            filesMap.size,
            totalBytes
        ]);
        const newReleaseId = relRes.rows[0].id;
        for (const [relPath, fileInfo] of filesMap.entries()) {
            await client.query(`INSERT INTO release_files (release_id, relative_path, sha256, sha1, size_bytes, is_dir)
         VALUES ($1, $2, $3, $4, $5, $6)`, [newReleaseId, relPath, fileInfo.isDir ? null : fileInfo.sha256, fileInfo.isDir ? null : fileInfo.sha1, fileInfo.sizeBytes, fileInfo.isDir]);
        }
        return newReleaseId;
    });
    // If auto-publish or direct publication is triggered
    await publishReleaseInternal(endpointId, createdRelease, endpointSlug, manifestJson, releaseDir);
    // Mark upload session as completed
    await (0, db_1.query)(`UPDATE upload_sessions SET status = 'completed', updated_at = NOW() WHERE id = $1`, [sessionId]);
}
/**
 * Atomically publishes a release, updates index.php and database.
 */
async function publishReleaseInternal(endpointId, releaseDbId, endpointSlug, manifestJson, releaseDir) {
    const endpointDir = path_1.default.join(config_1.ENDPOINTS_DIR, endpointSlug);
    if (!fs_1.default.existsSync(endpointDir)) {
        fs_1.default.mkdirSync(endpointDir, { recursive: true, mode: 0o755 });
    }
    // 1. Write active manifest atomically: index.php.tmp -> index.php
    const activeManifestPath = path_1.default.join(endpointDir, 'index.php');
    const tempManifestPath = path_1.default.join(endpointDir, 'index.php.tmp');
    const fd = fs_1.default.openSync(tempManifestPath, 'w');
    fs_1.default.writeFileSync(fd, manifestJson, 'utf8');
    fs_1.default.fsyncSync(fd);
    fs_1.default.closeSync(fd);
    fs_1.default.renameSync(tempManifestPath, activeManifestPath);
    // 2. Atomically update 'active' symlink to release directory
    const activeLink = path_1.default.join(endpointDir, 'active');
    const tempLink = path_1.default.join(endpointDir, 'active.tmp');
    try {
        if (fs_1.default.existsSync(tempLink))
            fs_1.default.unlinkSync(tempLink);
        fs_1.default.symlinkSync(releaseDir, tempLink, 'junction');
        fs_1.default.renameSync(tempLink, activeLink);
    }
    catch (e) {
        // If symlink fails on non-unix, fallback to active link ignore
    }
    // 3. Update database transactions
    await (0, db_1.withTransaction)(async (client) => {
        // Deactivate previous active releases for this endpoint
        await client.query(`UPDATE releases SET is_active = FALSE WHERE endpoint_id = $1 AND is_active = TRUE`, [endpointId]);
        // Activate the new release
        await client.query(`UPDATE releases
       SET is_active = TRUE,
           status = 'published',
           published_at = NOW()
       WHERE id = $1`, [releaseDbId]);
    });
}
//# sourceMappingURL=publish.js.map