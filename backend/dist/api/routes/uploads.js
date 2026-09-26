"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tusServer = void 0;
exports.uploadRoutes = uploadRoutes;
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_1 = require("@tus/server");
const file_store_1 = require("@tus/file-store");
const db_1 = require("../../db");
const middleware_1 = require("../../auth/middleware");
const config_1 = require("../../config");
const queue_1 = require("../../jobs/queue");
const paths_1 = require("../../storage/paths");
// Setup TUS file store in a subfolder of staging
const tusUploadDir = path_1.default.join(config_1.STAGING_DIR, 'tus_chunks');
if (!fs_1.default.existsSync(tusUploadDir)) {
    fs_1.default.mkdirSync(tusUploadDir, { recursive: true, mode: 0o750 });
}
exports.tusServer = new server_1.Server({
    path: '/api/uploads/tus',
    datastore: new file_store_1.FileStore({ directory: tusUploadDir }),
    namingFunction: (req) => {
        return `tus_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    },
    onUploadFinish: async (req, res, upload) => {
        try {
            const metadata = upload.metadata || {};
            const endpointId = metadata.endpointId;
            const sessionId = metadata.sessionId;
            const relativePathRaw = metadata.relativePath || upload.id;
            const isZip = metadata.isZip === 'true';
            if (!endpointId || !sessionId) {
                return res;
            }
            // Find upload session
            const sessionRes = await (0, db_1.query)('SELECT * FROM upload_sessions WHERE id = $1', [sessionId]);
            if (sessionRes.rows.length === 0) {
                return res;
            }
            const session = sessionRes.rows[0];
            const sessionStagingDir = path_1.default.join(config_1.STAGING_DIR, sessionId);
            if (!fs_1.default.existsSync(sessionStagingDir)) {
                fs_1.default.mkdirSync(sessionStagingDir, { recursive: true, mode: 0o750 });
            }
            const tusFilePath = path_1.default.join(tusUploadDir, upload.id);
            if (isZip) {
                const destZipPath = path_1.default.join(sessionStagingDir, 'upload.zip');
                fs_1.default.renameSync(tusFilePath, destZipPath);
                await (0, queue_1.enqueueJob)('extract_zip_import', {
                    sessionId,
                    endpointId,
                    zipPath: destZipPath,
                    mode: session.mode
                }, 5);
                await (0, db_1.query)('UPDATE upload_sessions SET total_files = 1 WHERE id = $1', [sessionId]);
            }
            else {
                const sanitized = (0, paths_1.assertSanitizedRelativePath)(relativePathRaw);
                const destFilePath = path_1.default.join(sessionStagingDir, sanitized);
                const destDir = path_1.default.dirname(destFilePath);
                if (!fs_1.default.existsSync(destDir)) {
                    fs_1.default.mkdirSync(destDir, { recursive: true, mode: 0o750 });
                }
                fs_1.default.renameSync(tusFilePath, destFilePath);
                const stat = fs_1.default.statSync(destFilePath);
                const fileInsert = await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, status)
           VALUES ($1, $2, $3, $4, $5, 'staged')
           RETURNING id`, [sessionId, sanitized, destFilePath, stat.size, stat.size]);
                await (0, queue_1.enqueueJob)('process_upload_file', {
                    uploadFileId: fileInsert.rows[0].id,
                    sessionId,
                    stagingPath: destFilePath,
                    relativePath: sanitized
                }, 3);
                await (0, db_1.query)('UPDATE upload_sessions SET total_files = total_files + 1 WHERE id = $1', [sessionId]);
            }
        }
        catch (err) {
            console.error('Erreur dans le callback tus onUploadFinish :', err);
        }
        return res;
    }
});
async function uploadRoutes(fastify) {
    fastify.addHook('preHandler', middleware_1.authenticateRequest);
    // 1. Create a new upload session
    fastify.post('/endpoints/:id/uploads/sessions', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId } = req.params;
        const schema = zod_1.z.object({
            mode: zod_1.z.enum(['add_replace', 'full_replace']).default('add_replace'),
            sourceType: zod_1.z.enum(['manual', 'zip', 'folder', 'watched']).default('manual')
        });
        const parsed = schema.safeParse(req.body || {});
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const { mode, sourceType } = parsed.data;
        // Verify endpoint exists
        const epRes = await (0, db_1.query)('SELECT id FROM endpoints WHERE id = $1', [endpointId]);
        if (epRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        const res = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, $3, $4, 'uploading', 0, 0, 0)
       RETURNING *`, [endpointId, req.user.userId, mode, sourceType]);
        const session = res.rows[0];
        const sessionStaging = path_1.default.join(config_1.STAGING_DIR, session.id);
        if (!fs_1.default.existsSync(sessionStaging)) {
            fs_1.default.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
        }
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'create', 'upload_session', session.id, { endpointId, mode, sourceType }, req.ip);
        return reply.status(201).send({ session });
    });
    // 2. List sessions for an endpoint
    fastify.get('/endpoints/:id/uploads/sessions', async (req, reply) => {
        const { id: endpointId } = req.params;
        const res = await (0, db_1.query)(`SELECT s.*, u.username as user_name
       FROM upload_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.endpoint_id = $1
       ORDER BY s.created_at DESC
       LIMIT 30`, [endpointId]);
        return reply.send({ sessions: res.rows });
    });
    // 3. Get single session status
    fastify.get('/endpoints/:id/uploads/sessions/:sessionId', async (req, reply) => {
        const { id: endpointId, sessionId } = req.params;
        const sessionRes = await (0, db_1.query)(`SELECT s.*, u.username as user_name
       FROM upload_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.endpoint_id = $2`, [sessionId, endpointId]);
        if (sessionRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Session introuvable' });
        }
        const filesRes = await (0, db_1.query)(`SELECT id, relative_path, size_bytes, status, error_message, updated_at
       FROM upload_files
       WHERE session_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`, [sessionId]);
        return reply.send({
            session: sessionRes.rows[0],
            files: filesRes.rows
        });
    });
    // 4. Commit session -> triggers release build & publication
    fastify.post('/endpoints/:id/uploads/sessions/:sessionId/commit', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId, sessionId } = req.params;
        const sessionRes = await (0, db_1.query)(`SELECT s.*, e.slug
       FROM upload_sessions s
       JOIN endpoints e ON e.id = s.endpoint_id
       WHERE s.id = $1 AND s.endpoint_id = $2`, [sessionId, endpointId]);
        if (sessionRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Session introuvable' });
        }
        const session = sessionRes.rows[0];
        if (session.status === 'processing' || session.status === 'completed') {
            return reply.status(400).send({ error: `La session est déjà dans l'état: ${session.status}` });
        }
        // Check if there are pending hashing jobs
        const pendingFiles = await (0, db_1.query)(`SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status IN ('staged', 'hashing')`, [sessionId]);
        const pendingCount = parseInt(pendingFiles.rows[0].count, 10);
        if (pendingCount > 0) {
            return reply.status(400).send({
                error: `Il reste ${pendingCount} fichier(s) en cours de hachage. Veuillez patienter avant de publier.`
            });
        }
        // Mark session as processing
        await (0, db_1.query)(`UPDATE upload_sessions SET status = 'processing', updated_at = NOW() WHERE id = $1`, [sessionId]);
        // Enqueue seal and build job
        const job = await (0, queue_1.enqueueJob)('seal_and_build_release', { sessionId }, 10);
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'publish', 'upload_session', sessionId, { jobId: job.id }, req.ip);
        return reply.send({ success: true, jobId: job.id });
    });
    // 5. Direct single/multipart upload
    fastify.post('/endpoints/:id/uploads/direct', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId } = req.params;
        if (!req.isMultipart()) {
            return reply.status(400).send({ error: 'Requête multipart/form-data requise' });
        }
        const parts = req.parts();
        let sessionId = null;
        let relPath = null;
        let fileUploaded = false;
        let fields = {};
        for await (const part of parts) {
            if (part.type === 'field') {
                fields[part.fieldname] = part.value;
                if (part.fieldname === 'sessionId')
                    sessionId = part.value;
                if (part.fieldname === 'relativePath')
                    relPath = part.value;
            }
            else if (part.type === 'file') {
                if (!sessionId) {
                    sessionId = fields.sessionId;
                }
                if (!sessionId) {
                    const newSess = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
             VALUES ($1, $2, 'add_replace', 'manual', 'uploading', 0, 0, 0)
             RETURNING id`, [endpointId, req.user.userId]);
                    sessionId = newSess.rows[0].id;
                }
                if (!sessionId) {
                    throw new Error('Identifiant de session manquant');
                }
                const activeSessionId = sessionId;
                const rawTarget = (relPath || fields.relativePath || part.filename || 'unnamed');
                const effectiveRelPath = (0, paths_1.assertSanitizedRelativePath)(rawTarget);
                const sessionStaging = path_1.default.join(config_1.STAGING_DIR, activeSessionId);
                if (!fs_1.default.existsSync(sessionStaging)) {
                    fs_1.default.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
                }
                const targetFilePath = path_1.default.join(sessionStaging, effectiveRelPath);
                const targetDir = path_1.default.dirname(targetFilePath);
                if (!fs_1.default.existsSync(targetDir)) {
                    fs_1.default.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
                }
                const writeStream = fs_1.default.createWriteStream(targetFilePath);
                await new Promise((resolve, reject) => {
                    part.file.pipe(writeStream);
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
                const stat = fs_1.default.statSync(targetFilePath);
                const fileRes = await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, status)
           VALUES ($1, $2, $3, $4, $5, 'staged')
           RETURNING id`, [sessionId, effectiveRelPath, targetFilePath, stat.size, stat.size]);
                await (0, queue_1.enqueueJob)('process_upload_file', {
                    uploadFileId: fileRes.rows[0].id,
                    sessionId,
                    stagingPath: targetFilePath,
                    relativePath: effectiveRelPath
                }, 3);
                await (0, db_1.query)('UPDATE upload_sessions SET total_files = total_files + 1 WHERE id = $1', [sessionId]);
                fileUploaded = true;
            }
        }
        if (!fileUploaded) {
            return reply.status(400).send({ error: 'Aucun fichier reçu' });
        }
        return reply.send({ success: true, sessionId });
    });
    // 6. Direct ZIP upload
    fastify.post('/endpoints/:id/uploads/zip', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId } = req.params;
        if (!req.isMultipart()) {
            return reply.status(400).send({ error: 'Requête multipart/form-data requise' });
        }
        const data = await req.file();
        if (!data) {
            return reply.status(400).send({ error: 'Aucun fichier archive ZIP reçu' });
        }
        const mode = data.fields.mode?.value === 'full_replace' ? 'full_replace' : 'add_replace';
        const epRes = await (0, db_1.query)('SELECT id FROM endpoints WHERE id = $1', [endpointId]);
        if (epRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        const sessRes = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, $3, 'zip', 'uploading', 1, 0, 0)
       RETURNING id`, [endpointId, req.user.userId, mode]);
        const sessionId = sessRes.rows[0].id;
        const sessionStaging = path_1.default.join(config_1.STAGING_DIR, sessionId);
        fs_1.default.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
        const zipFilePath = path_1.default.join(sessionStaging, 'upload.zip');
        const writeStream = fs_1.default.createWriteStream(zipFilePath);
        await new Promise((resolve, reject) => {
            data.file.pipe(writeStream);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        const job = await (0, queue_1.enqueueJob)('extract_zip_import', {
            sessionId,
            endpointId,
            zipPath: zipFilePath,
            mode
        }, 5);
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'upload_zip', 'endpoint', endpointId, { sessionId, jobId: job.id, mode }, req.ip);
        return reply.status(202).send({
            message: 'Archive ZIP reçue, extraction et validation en cours',
            sessionId,
            jobId: job.id
        });
    });
}
//# sourceMappingURL=uploads.js.map