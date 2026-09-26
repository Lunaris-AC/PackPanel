"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCasObjectPath = void 0;
exports.getObjectPath = getObjectPath;
exports.storeBufferInCas = storeBufferInCas;
exports.getObjectRelPath = getObjectRelPath;
exports.storeObjectFromPath = storeObjectFromPath;
exports.linkObjectToRelease = linkObjectToRelease;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../config");
const hasher_1 = require("./hasher");
const db_1 = require("../db");
function getObjectPath(sha256) {
    const dir1 = sha256.substring(0, 2);
    const dir2 = sha256.substring(2, 4);
    return path_1.default.join(config_1.OBJECTS_DIR, dir1, dir2, sha256);
}
exports.getCasObjectPath = getObjectPath;
async function storeBufferInCas(buffer, sha256, sha1) {
    const targetPath = getObjectPath(sha256);
    const targetDir = path_1.default.dirname(targetPath);
    if (!fs_1.default.existsSync(targetDir)) {
        fs_1.default.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
    }
    if (!fs_1.default.existsSync(targetPath)) {
        fs_1.default.writeFileSync(targetPath, buffer);
    }
    const relPath = getObjectRelPath(sha256);
    await (0, db_1.query)(`INSERT INTO objects (sha256, sha1, size_bytes, storage_rel_path, ref_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (sha256) DO UPDATE SET ref_count = objects.ref_count + 1`, [sha256, sha1, buffer.length, relPath]);
}
function getObjectRelPath(sha256) {
    const dir1 = sha256.substring(0, 2);
    const dir2 = sha256.substring(2, 4);
    return path_1.default.join(dir1, dir2, sha256).replace(/\\/g, '/');
}
/**
 * Stores a file into Content-Addressed Storage.
 * Deduplicates automatically if the object is already stored.
 */
async function storeObjectFromPath(tempFilePath, precalculated, mimeType = 'application/octet-stream') {
    const hashes = precalculated || await (0, hasher_1.hashFile)(tempFilePath);
    const targetPath = getObjectPath(hashes.sha256);
    const relPath = getObjectRelPath(hashes.sha256);
    // Check if object already exists in database
    const existing = await (0, db_1.query)('SELECT sha256, sha1, size_bytes, mime_type, storage_rel_path FROM objects WHERE sha256 = $1', [hashes.sha256]);
    if (existing.rows.length > 0) {
        // Already stored in CAS! Deduplication hit.
        // Clean up temporary file
        try {
            if (fs_1.default.existsSync(tempFilePath)) {
                fs_1.default.unlinkSync(tempFilePath);
            }
        }
        catch (e) {
            // ignore
        }
        const row = existing.rows[0];
        return {
            sha256: row.sha256,
            sha1: row.sha1,
            sizeBytes: Number(row.size_bytes),
            mimeType: row.mime_type,
            storageRelPath: row.storage_rel_path
        };
    }
    // Not in CAS yet. Ensure target directory exists.
    const targetDir = path_1.default.dirname(targetPath);
    if (!fs_1.default.existsSync(targetDir)) {
        fs_1.default.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
    }
    // Move or copy file
    try {
        fs_1.default.renameSync(tempFilePath, targetPath);
    }
    catch (err) {
        if (err.code === 'EXDEV') {
            fs_1.default.copyFileSync(tempFilePath, targetPath);
            fs_1.default.unlinkSync(tempFilePath);
        }
        else {
            throw err;
        }
    }
    // Set read-only permissions on stored object
    fs_1.default.chmodSync(targetPath, 0o640);
    // Record in database
    await (0, db_1.query)(`INSERT INTO objects (sha256, sha1, size_bytes, mime_type, storage_rel_path, ref_count)
     VALUES ($1, $2, $3, $4, $5, 1)
     ON CONFLICT (sha256) DO NOTHING`, [hashes.sha256, hashes.sha1, hashes.sizeBytes, mimeType, relPath]);
    return {
        sha256: hashes.sha256,
        sha1: hashes.sha1,
        sizeBytes: hashes.sizeBytes,
        mimeType,
        storageRelPath: relPath
    };
}
/**
 * Links a CAS object to a destination file in a release directory.
 * Uses hardlinks for zero-copy performance, with fallback to copy.
 */
function linkObjectToRelease(sha256, destinationFilePath) {
    const sourcePath = getObjectPath(sha256);
    if (!fs_1.default.existsSync(sourcePath)) {
        throw new Error(`Objet CAS introuvable pour le hash ${sha256}`);
    }
    const destDir = path_1.default.dirname(destinationFilePath);
    if (!fs_1.default.existsSync(destDir)) {
        fs_1.default.mkdirSync(destDir, { recursive: true, mode: 0o755 });
    }
    if (fs_1.default.existsSync(destinationFilePath)) {
        fs_1.default.unlinkSync(destinationFilePath);
    }
    try {
        fs_1.default.linkSync(sourcePath, destinationFilePath);
    }
    catch (err) {
        // Fallback to copy if hardlink is not supported across filesystem boundaries
        fs_1.default.copyFileSync(sourcePath, destinationFilePath);
    }
}
//# sourceMappingURL=cas.js.map