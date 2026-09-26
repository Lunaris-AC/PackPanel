"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.endpointRoutes = endpointRoutes;
const zod_1 = require("zod");
const db_1 = require("../../db");
const middleware_1 = require("../../auth/middleware");
const config_1 = require("../../config");
const publish_1 = require("../../jobs/handlers/publish");
const path_1 = __importDefault(require("path"));
const config_2 = require("../../config");
async function endpointRoutes(fastify) {
    fastify.addHook('preHandler', middleware_1.authenticateRequest);
    // List all endpoints
    fastify.get('/', async (req, reply) => {
        const res = await (0, db_1.query)(`
      SELECT e.*,
        (SELECT release_id FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_release_id,
        (SELECT version_num FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_version_num,
        (SELECT total_files FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_total_files,
        (SELECT total_bytes FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_total_bytes
      FROM endpoints e
      ORDER BY e.created_at DESC
    `);
        const endpoints = res.rows.map(row => ({
            ...row,
            manifest_url: `https://${config_1.config.FILES_FQDN}/${row.slug}/index.php`
        }));
        return reply.send({ endpoints });
    });
    // Get endpoint detail
    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params;
        const res = await (0, db_1.query)(`
      SELECT e.*,
        (SELECT release_id FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_release_id,
        (SELECT version_num FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_version_num,
        (SELECT total_files FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_total_files,
        (SELECT total_bytes FROM releases WHERE endpoint_id = e.id AND is_active = TRUE LIMIT 1) as active_total_bytes
      FROM endpoints e
      WHERE e.id = $1
    `, [id]);
        if (res.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        const endpoint = res.rows[0];
        return reply.send({
            endpoint: {
                ...endpoint,
                manifest_url: `https://${config_1.config.FILES_FQDN}/${endpoint.slug}/index.php`
            }
        });
    });
    // Create endpoint
    fastify.post('/', { preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])] }, async (req, reply) => {
        const schema = zod_1.z.object({
            slug: zod_1.z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, 'Le slug ne doit contenir que des lettres minuscules, chiffres, tirets et underscores'),
            name: zod_1.z.string().min(2).max(128),
            description: zod_1.z.string().default(''),
            cleanup_rules: zod_1.z.array(zod_1.z.string()).default(['mods']),
            auto_publish: zod_1.z.boolean().default(false),
            default_retention_days: zod_1.z.number().int().min(1).default(14),
            min_retained_versions: zod_1.z.number().int().min(1).default(5),
            quota_bytes: zod_1.z.number().int().min(0).default(0),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const data = parsed.data;
        const existing = await (0, db_1.query)('SELECT id FROM endpoints WHERE slug = $1', [data.slug]);
        if (existing.rows.length > 0) {
            return reply.status(400).send({ error: `Le slug "${data.slug}" est déjà utilisé` });
        }
        const res = await (0, db_1.query)(`INSERT INTO endpoints (slug, name, description, cleanup_rules, auto_publish, default_retention_days, min_retained_versions, quota_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`, [
            data.slug,
            data.name,
            data.description,
            JSON.stringify(data.cleanup_rules),
            data.auto_publish,
            data.default_retention_days,
            data.min_retained_versions,
            data.quota_bytes
        ]);
        const endpoint = res.rows[0];
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'create', 'endpoint', endpoint.id, { slug: data.slug }, req.ip);
        return reply.status(201).send({
            endpoint: {
                ...endpoint,
                manifest_url: `https://${config_1.config.FILES_FQDN}/${endpoint.slug}/index.php`
            }
        });
    });
    // Update endpoint
    fastify.put('/:id', { preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])] }, async (req, reply) => {
        const { id } = req.params;
        const schema = zod_1.z.object({
            name: zod_1.z.string().min(2).max(128).optional(),
            description: zod_1.z.string().optional(),
            cleanup_rules: zod_1.z.array(zod_1.z.string()).optional(),
            auto_publish: zod_1.z.boolean().optional(),
            default_retention_days: zod_1.z.number().int().min(1).optional(),
            min_retained_versions: zod_1.z.number().int().min(1).optional(),
            quota_bytes: zod_1.z.number().int().min(0).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const data = parsed.data;
        const res = await (0, db_1.query)(`UPDATE endpoints
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           cleanup_rules = COALESCE($3, cleanup_rules),
           auto_publish = COALESCE($4, auto_publish),
           default_retention_days = COALESCE($5, default_retention_days),
           min_retained_versions = COALESCE($6, min_retained_versions),
           quota_bytes = COALESCE($7, quota_bytes),
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`, [
            data.name,
            data.description,
            data.cleanup_rules ? JSON.stringify(data.cleanup_rules) : null,
            data.auto_publish,
            data.default_retention_days,
            data.min_retained_versions,
            data.quota_bytes,
            id
        ]);
        if (res.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'update', 'endpoint', id, data, req.ip);
        return reply.send({ endpoint: res.rows[0] });
    });
    // Promote/Clone a release to another endpoint
    fastify.post('/:id/promote', { preHandler: [(0, middleware_1.requireRole)(['admin', 'operator'])] }, async (req, reply) => {
        const { id: sourceEndpointId } = req.params;
        const bodySchema = zod_1.z.object({
            targetEndpointId: zod_1.z.string().uuid(),
            releaseId: zod_1.z.string().optional(), // if omitted, uses active release
        });
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const { targetEndpointId, releaseId } = parsed.data;
        const targetRes = await (0, db_1.query)('SELECT id, slug, cleanup_rules FROM endpoints WHERE id = $1', [targetEndpointId]);
        if (targetRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint cible introuvable' });
        }
        const targetEndpoint = targetRes.rows[0];
        // Find source release
        let sourceRelQuery = 'SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE';
        let params = [sourceEndpointId];
        if (releaseId) {
            sourceRelQuery = 'SELECT * FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)';
            params = [sourceEndpointId, releaseId];
        }
        const sourceRelRes = await (0, db_1.query)(sourceRelQuery, params);
        if (sourceRelRes.rows.length === 0) {
            return reply.status(404).send({ error: 'Version source introuvable' });
        }
        const sourceRel = sourceRelRes.rows[0];
        // Next version num in target
        const maxVer = await (0, db_1.query)('SELECT COALESCE(MAX(version_num), 0) + 1 as next_v FROM releases WHERE endpoint_id = $1', [targetEndpointId]);
        const nextVerNum = parseInt(maxVer.rows[0].next_v, 10);
        const newReleaseIdStr = `r${String(nextVerNum).padStart(4, '0')}`;
        // Target directory
        const newReleaseDir = path_1.default.join(config_2.ENDPOINTS_DIR, targetEndpoint.slug, 'releases', newReleaseIdStr);
        const manifestJson = sourceRel.manifest_content;
        // Create target release
        const newRelId = await (0, db_1.withTransaction)(async (client) => {
            const relInsert = await client.query(`INSERT INTO releases (endpoint_id, release_id, version_num, status, is_active, is_pinned, created_by_user_id, manifest_content, total_files, total_bytes)
         VALUES ($1, $2, $3, 'draft', FALSE, FALSE, $4, $5, $6, $7)
         RETURNING id`, [targetEndpointId, newReleaseIdStr, nextVerNum, req.user.userId, manifestJson, sourceRel.total_files, sourceRel.total_bytes]);
            const targetRelDbId = relInsert.rows[0].id;
            // Copy release_files
            await client.query(`INSERT INTO release_files (release_id, relative_path, sha256, sha1, size_bytes, is_dir)
         SELECT $1, relative_path, sha256, sha1, size_bytes, is_dir
         FROM release_files
         WHERE release_id = $2`, [targetRelDbId, sourceRel.id]);
            return targetRelDbId;
        });
        // Publish release on target
        await (0, publish_1.publishReleaseInternal)(targetEndpointId, newRelId, targetEndpoint.slug, JSON.stringify(manifestJson), newReleaseDir);
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'promote', 'endpoint', targetEndpointId, {
            fromEndpoint: sourceEndpointId,
            sourceRelease: sourceRel.release_id,
            newRelease: newReleaseIdStr
        }, req.ip);
        return reply.send({ success: true, newReleaseId: newReleaseIdStr });
    });
    // Delete endpoint
    fastify.delete('/:id', { preHandler: [(0, middleware_1.requireRole)(['admin'])] }, async (req, reply) => {
        const { id } = req.params;
        const res = await (0, db_1.query)('DELETE FROM endpoints WHERE id = $1 RETURNING slug', [id]);
        if (res.rows.length === 0) {
            return reply.status(404).send({ error: 'Endpoint introuvable' });
        }
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'delete', 'endpoint', id, { slug: res.rows[0].slug }, req.ip);
        return reply.send({ success: true });
    });
}
//# sourceMappingURL=endpoints.js.map