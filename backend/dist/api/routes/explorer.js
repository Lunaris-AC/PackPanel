"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.explorerRoutes = explorerRoutes;
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../db");
const middleware_1 = require("../../auth/middleware");
const config_1 = require("../../config");
const cas_1 = require("../../storage/cas");
const hasher_1 = require("../../storage/hasher");
const paths_1 = require("../../storage/paths");
const publish_1 = require("../../jobs/handlers/publish");
const TEXT_EXTENSIONS = new Set([
    '.txt', '.json', '.json5', '.toml', '.cfg', '.conf', '.properties',
    '.js', '.ts', '.lua', '.yaml', '.yml', '.md', '.log', '.zs', '.snbt',
    '.lang', '.xml', '.html', '.css', '.ini', '.sh', '.bat', '.cmd'
]);
const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'
]);
async function explorerRoutes(fastify) {
    fastify.addHook('preHandler', middleware_1.authenticateRequest);
    // List files/folders in an endpoint release
    fastify.get('/endpoints/:id/explorer', async (req, reply) => {
        const { id: endpointId } = req.params;
        const { releaseId, prefix = '', search = '' } = req.query;
        // Find target release
        let targetRelId = null;
        let releaseInfo = null;
        if (releaseId) {
            const relRes = await (0, db_1.query)('SELECT * FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)', [endpointId, releaseId]);
            if (relRes.rows.length > 0) {
                releaseInfo = relRes.rows[0];
                targetRelId = releaseInfo.id;
            }
        }
        else {
            const relRes = await (0, db_1.query)('SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1', [endpointId]);
            if (relRes.rows.length > 0) {
                releaseInfo = relRes.rows[0];
                targetRelId = releaseInfo.id;
            }
        }
        if (!targetRelId) {
            return reply.send({
                hasRelease: false,
                items: [],
                currentPrefix: prefix,
                totalItems: 0
            });
        }
        const normPrefix = prefix ? (prefix.endsWith('/') ? prefix : prefix + '/') : '';
        let itemsQuery = `
      SELECT relative_path, sha256, sha1, size_bytes, is_dir
      FROM release_files
      WHERE release_id = $1
    `;
        const params = [targetRelId];
        if (search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            itemsQuery += ` AND LOWER(relative_path) LIKE $${params.length}`;
        }
        itemsQuery += ` ORDER BY is_dir DESC, relative_path ASC`;
        const res = await (0, db_1.query)(itemsQuery, params);
        let items = res.rows;
        if (!search.trim()) {
            const immediateItems = new Map();
            for (const row of res.rows) {
                const p = row.relative_path;
                if (normPrefix && !p.startsWith(normPrefix))
                    continue;
                const subPath = p.slice(normPrefix.length);
                if (!subPath)
                    continue;
                const slashIdx = subPath.indexOf('/');
                if (slashIdx !== -1) {
                    const dirName = subPath.substring(0, slashIdx);
                    const fullDirPath = normPrefix + dirName + '/';
                    if (!immediateItems.has(fullDirPath)) {
                        immediateItems.set(fullDirPath, {
                            path: fullDirPath,
                            name: dirName,
                            isDir: true,
                            size: 0,
                            sha1: false,
                            sha256: null
                        });
                    }
                }
                else {
                    immediateItems.set(p, {
                        path: p,
                        name: subPath,
                        isDir: row.is_dir,
                        size: Number(row.size_bytes),
                        sha1: row.sha1,
                        sha256: row.sha256
                    });
                }
            }
            items = Array.from(immediateItems.values()).sort((a, b) => {
                if (a.isDir !== b.isDir)
                    return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
        }
        else {
            items = items.map(r => ({
                path: r.relative_path,
                name: path_1.default.basename(r.relative_path),
                isDir: r.is_dir,
                size: Number(r.size_bytes),
                sha1: r.sha1,
                sha256: r.sha256
            }));
        }
        return reply.send({
            hasRelease: true,
            release: {
                id: releaseInfo.id,
                releaseId: releaseInfo.release_id,
                versionNum: releaseInfo.version_num,
                isActive: releaseInfo.is_active,
                totalFiles: releaseInfo.total_files,
                totalBytes: Number(releaseInfo.total_bytes),
                createdAt: releaseInfo.created_at
            },
            currentPrefix: normPrefix,
            items
        });
    });
    // Get file content (text preview or download meta)
    fastify.get('/endpoints/:id/explorer/content', async (req, reply) => {
        const { id: endpointId } = req.params;
        const { releaseId, path: filePath } = req.query;
        if (!filePath) {
            return reply.status(400).send({ error: 'Chemin de fichier requis' });
        }
        let sanitizedPath;
        try {
            sanitizedPath = (0, paths_1.assertSanitizedRelativePath)(filePath);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
        let targetRelId = null;
        if (releaseId) {
            const relRes = await (0, db_1.query)('SELECT id FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)', [endpointId, releaseId]);
            if (relRes.rows.length > 0)
                targetRelId = relRes.rows[0].id;
        }
        else {
            const relRes = await (0, db_1.query)('SELECT id FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1', [endpointId]);
            if (relRes.rows.length > 0)
                targetRelId = relRes.rows[0].id;
        }
        if (!targetRelId) {
            return reply.status(404).send({ error: 'Version active introuvable' });
        }
        const fileRes = await (0, db_1.query)('SELECT * FROM release_files WHERE release_id = $1 AND relative_path = $2', [targetRelId, sanitizedPath]);
        if (fileRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Fichier introuvable dans cette version' });
        }
        const fileRecord = fileRes.rows[0];
        const casPath = (0, cas_1.getCasObjectPath)(fileRecord.sha256);
        if (!fs_1.default.existsSync(casPath)) {
            return reply.status(404).send({ error: "L'objet n'existe plus dans le CAS" });
        }
        const ext = path_1.default.extname(sanitizedPath).toLowerCase();
        const isText = TEXT_EXTENSIONS.has(ext);
        const isImage = IMAGE_EXTENSIONS.has(ext);
        const size = Number(fileRecord.size_bytes);
        if (isText) {
            if (size > 2 * 1024 * 1024) {
                return reply.send({
                    path: sanitizedPath,
                    isText: true,
                    tooLarge: true,
                    size,
                    sha1: fileRecord.sha1,
                    sha256: fileRecord.sha256
                });
            }
            const textContent = fs_1.default.readFileSync(casPath, 'utf8');
            return reply.send({
                path: sanitizedPath,
                isText: true,
                content: textContent,
                size,
                sha1: fileRecord.sha1,
                sha256: fileRecord.sha256
            });
        }
        if (isImage && size < 5 * 1024 * 1024) {
            const buffer = fs_1.default.readFileSync(casPath);
            const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            const base64 = `data:${mime};base64,${buffer.toString('base64')}`;
            return reply.send({
                path: sanitizedPath,
                isText: false,
                isImage: true,
                base64,
                size,
                sha1: fileRecord.sha1,
                sha256: fileRecord.sha256
            });
        }
        return reply.send({
            path: sanitizedPath,
            isText: false,
            isImage: false,
            size,
            sha1: fileRecord.sha1,
            sha256: fileRecord.sha256
        });
    });
    // Save/Edit a text file and auto-publish or stage as draft
    fastify.post('/endpoints/:id/explorer/save-file', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId } = req.params;
        const schema = zod_1.z.object({
            path: zod_1.z.string().min(1),
            content: zod_1.z.string(),
            commitNow: zod_1.z.boolean().default(true)
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const { path: rawPath, content, commitNow } = parsed.data;
        let sanitizedPath;
        try {
            sanitizedPath = (0, paths_1.assertSanitizedRelativePath)(rawPath);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
        const epRes = await (0, db_1.query)('SELECT * FROM endpoints WHERE id = $1', [endpointId]);
        if (epRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        const buf = Buffer.from(content, 'utf8');
        const { sha1, sha256 } = (0, hasher_1.hashBuffer)(buf);
        await (0, cas_1.storeBufferInCas)(buf, sha256, sha1);
        const sessRes = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, 'add_replace', 'manual', 'completed', 1, 1, 0)
       RETURNING id`, [endpointId, req.user.userId]);
        const sessionId = sessRes.rows[0].id;
        const sessionStaging = path_1.default.join(config_1.STAGING_DIR, sessionId);
        fs_1.default.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
        const stagedFile = path_1.default.join(sessionStaging, sanitizedPath);
        fs_1.default.mkdirSync(path_1.default.dirname(stagedFile), { recursive: true, mode: 0o750 });
        fs_1.default.writeFileSync(stagedFile, buf);
        await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, sha256, sha1, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')`, [sessionId, sanitizedPath, stagedFile, buf.length, buf.length, sha256, sha1]);
        if (commitNow) {
            await (0, publish_1.handleSealAndBuildRelease)({ sessionId });
            await (0, middleware_1.recordAuditLog)(req.user.userId, 'edit_file', 'endpoint', endpointId, {
                path: sanitizedPath,
                sha1,
                sha256,
                committed: true
            }, req.ip);
            return reply.send({ success: true, message: 'Fichier enregistré et nouvelle version publiée avec succès' });
        }
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'edit_file', 'endpoint', endpointId, {
            path: sanitizedPath,
            sha1,
            sha256,
            committed: false
        }, req.ip);
        return reply.send({ success: true, message: 'Fichier enregistré en brouillon (session ' + sessionId + ')' });
    });
    // Delete file or directory from active release
    fastify.post('/endpoints/:id/explorer/delete', {
        preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])]
    }, async (req, reply) => {
        const { id: endpointId } = req.params;
        const schema = zod_1.z.object({
            path: zod_1.z.string().min(1)
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const isExplicitDir = parsed.data.path.endsWith('/');
        let targetPath;
        try {
            targetPath = (0, paths_1.assertSanitizedRelativePath)(parsed.data.path, isExplicitDir);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
        const activeRelRes = await (0, db_1.query)('SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1', [endpointId]);
        if (activeRelRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Aucune version active trouvée' });
        }
        const activeRelease = activeRelRes.rows[0];
        const filesRes = await (0, db_1.query)('SELECT relative_path, sha256, sha1, size_bytes, is_dir FROM release_files WHERE release_id = $1', [activeRelease.id]);
        const remainingFiles = filesRes.rows.filter(f => {
            if (f.relative_path === targetPath)
                return false;
            if (isExplicitDir && f.relative_path.startsWith(targetPath))
                return false;
            return true;
        });
        if (remainingFiles.length === filesRes.rows.length) {
            return reply.status(404).send({ error: 'Élément introuvable dans la version active' });
        }
        const sessRes = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, 'full_replace', 'manual', 'completed', $3, $3, 0)
       RETURNING id`, [endpointId, req.user.userId, remainingFiles.length]);
        const sessionId = sessRes.rows[0].id;
        const sessionStaging = path_1.default.join(config_1.STAGING_DIR, sessionId);
        fs_1.default.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
        for (const f of remainingFiles) {
            await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, sha256, sha1, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')`, [sessionId, f.relative_path, '', f.size_bytes, f.size_bytes, f.sha256, f.sha1]);
        }
        await (0, publish_1.handleSealAndBuildRelease)({ sessionId });
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'delete_file', 'endpoint', endpointId, {
            path: targetPath,
            remainingCount: remainingFiles.length
        }, req.ip);
        return reply.send({ success: true, message: 'Élément supprimé et nouvelle version publiée' });
    });
}
//# sourceMappingURL=explorer.js.map