"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleProcessUploadFile = handleProcessUploadFile;
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../../db");
const cas_1 = require("../../storage/cas");
const paths_1 = require("../../storage/paths");
const queue_1 = require("../queue");
async function handleProcessUploadFile(payload) {
    const { uploadFileId, tempFilePath, sessionId, relativePath, expectedSize } = payload;
    if (!fs_1.default.existsSync(tempFilePath)) {
        throw new Error(`Fichier temporaire d'upload introuvable : ${tempFilePath}`);
    }
    const pathValidation = (0, paths_1.sanitizeRelativePath)(relativePath);
    if (!pathValidation.valid || !pathValidation.normalizedPath) {
        throw new Error(`Chemin invalide pour l'upload : ${pathValidation.error}`);
    }
    const cleanPath = pathValidation.normalizedPath;
    // Store in CAS (computes SHA-1, SHA-256 and deduplicates)
    const casObj = await (0, cas_1.storeObjectFromPath)(tempFilePath);
    // Update upload_file in database
    await (0, db_1.query)(`UPDATE upload_files
     SET sha256 = $1,
         sha1 = $2,
         received_size = $3,
         status = 'verified'
     WHERE id = $4`, [casObj.sha256, casObj.sha1, casObj.sizeBytes, uploadFileId]);
    // Update session progress
    const sessionRes = await (0, db_1.query)(`UPDATE upload_sessions
     SET received_files_count = (SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status = 'verified'),
         total_bytes_received = (SELECT COALESCE(SUM(received_size), 0) FROM upload_files WHERE session_id = $1 AND status = 'verified'),
         updated_at = NOW()
     WHERE id = $1
     RETURNING status, expected_files_count, received_files_count`, [sessionId]);
    if (sessionRes.rows.length > 0) {
        const session = sessionRes.rows[0];
        // If the session has been sealed by the client and all files are verified, build and publish release
        if (session.status === 'sealed' && session.received_files_count >= session.expected_files_count) {
            await queue_1.JobQueue.enqueue('seal_and_build_release', { sessionId });
        }
    }
}
//# sourceMappingURL=hash.js.map