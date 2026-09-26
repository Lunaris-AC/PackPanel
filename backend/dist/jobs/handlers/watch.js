"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleScanIncomingFolder = handleScanIncomingFolder;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../db");
const config_1 = require("../../config");
const paths_1 = require("../../storage/paths");
const cas_1 = require("../../storage/cas");
const queue_1 = require("../queue");
const CONTROL_FILES = new Set(['.ready', '.seal', '.git', '.DS_Store', 'Thumbs.db']);
async function handleScanIncomingFolder(payload) {
    const { endpointId, slug } = payload;
    const incomingDir = path_1.default.join(config_1.ENDPOINTS_DIR, slug, 'incoming');
    if (!fs_1.default.existsSync(incomingDir)) {
        fs_1.default.mkdirSync(incomingDir, { recursive: true, mode: 0o750 });
        return;
    }
    // Look for subfolders or a top-level .ready marker
    const entries = fs_1.default.readdirSync(incomingDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const batchDir = path_1.default.join(incomingDir, entry.name);
            const markerPath = path_1.default.join(batchDir, '.ready');
            const sealPath = path_1.default.join(batchDir, '.seal');
            // Only process sealed batches! A silent directory is never assumed complete without a marker
            if (fs_1.default.existsSync(markerPath) || fs_1.default.existsSync(sealPath)) {
                await processSealedBatch(endpointId, slug, batchDir);
            }
        }
    }
    // Check if incomingDir itself has a .ready marker
    const rootMarker = path_1.default.join(incomingDir, '.ready');
    if (fs_1.default.existsSync(rootMarker)) {
        await processSealedBatch(endpointId, slug, incomingDir, true);
    }
}
async function processSealedBatch(endpointId, slug, batchDir, isRoot = false) {
    console.log(`Processing sealed batch in ${batchDir} for endpoint ${slug}`);
    // Fetch admin user ID for attribution
    const adminRes = await (0, db_1.query)(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    const adminId = adminRes.rows[0]?.id;
    // Create an upload_session
    const sessionRes = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, status, expected_files_count, expires_at)
     VALUES ($1, $2, 'add_replace', 'processing', 0, NOW() + INTERVAL '24 hours')
     RETURNING id`, [endpointId, adminId]);
    const sessionId = sessionRes.rows[0].id;
    const collectedFiles = [];
    function walk(currentDir, relBase = '') {
        const items = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
        for (const it of items) {
            if (CONTROL_FILES.has(it.name))
                continue;
            const subRel = relBase ? `${relBase}/${it.name}` : it.name;
            const subFull = path_1.default.join(currentDir, it.name);
            if (it.isDirectory()) {
                walk(subFull, subRel);
            }
            else if (it.isFile()) {
                const validation = (0, paths_1.sanitizeRelativePath)(subRel);
                if (validation.valid && validation.normalizedPath) {
                    collectedFiles.push({
                        relPath: validation.normalizedPath,
                        fullPath: subFull,
                        size: fs_1.default.statSync(subFull).size
                    });
                }
            }
        }
    }
    walk(batchDir);
    if (collectedFiles.length === 0) {
        console.log(`Batch ${batchDir} is empty, skipping.`);
        if (!isRoot) {
            fs_1.default.rmSync(batchDir, { recursive: true, force: true });
        }
        else {
            const rootMarker = path_1.default.join(batchDir, '.ready');
            if (fs_1.default.existsSync(rootMarker))
                fs_1.default.unlinkSync(rootMarker);
        }
        return;
    }
    // Ingest files into CAS
    for (const f of collectedFiles) {
        // Copy into a temporary file to keep producer directory decoupled
        const tempCopy = `${f.fullPath}.ingest_${Date.now()}`;
        fs_1.default.copyFileSync(f.fullPath, tempCopy);
        const casObj = await (0, cas_1.storeObjectFromPath)(tempCopy);
        await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, expected_size, received_size, sha256, sha1, status)
       VALUES ($1, $2, $3, $3, $4, $5, 'verified')
       ON CONFLICT (session_id, relative_path) DO NOTHING`, [sessionId, f.relPath, f.size, casObj.sha256, casObj.sha1]);
    }
    const totalBytes = collectedFiles.reduce((acc, f) => acc + f.size, 0);
    await (0, db_1.query)(`UPDATE upload_sessions
     SET expected_files_count = $1,
         received_files_count = $1,
         total_bytes_expected = $2,
         total_bytes_received = $2,
         status = 'sealed'
     WHERE id = $3`, [collectedFiles.length, totalBytes, sessionId]);
    // Clean processed batch
    if (!isRoot) {
        fs_1.default.rmSync(batchDir, { recursive: true, force: true });
    }
    else {
        const rootMarker = path_1.default.join(batchDir, '.ready');
        if (fs_1.default.existsSync(rootMarker))
            fs_1.default.unlinkSync(rootMarker);
    }
    // Enqueue build and publish
    await queue_1.JobQueue.enqueue('seal_and_build_release', { sessionId });
}
//# sourceMappingURL=watch.js.map