import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { query, withTransaction } from '../../db';
import { authenticateRequest, canManageLauncherInstances, requireRole, requireInstancePermission, recordAuditLog } from '../../auth/middleware';
import { config, ENDPOINTS_DIR, STAGING_DIR, getFilesBaseUrl } from '../../config';
import { validateCombination, resolveJavaRequirement, LoaderType } from '../../catalog';
import { getWorkingRelease, handleSealAndBuildRelease, handlePublishRelease } from '../../jobs/handlers/publish';
import { buildLauncherArtifact, reserveLauncherBuild } from '../../build/launcher-builder';
import { storeBufferInCas, getCasObjectPath } from '../../storage/cas';
import { hashBuffer } from '../../storage/hasher';
import { sanitizeRelativePath } from '../../storage/paths';
import { launcherArchivePath, sendLauncherArchive } from './player';

const InstanceCreateSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-_]+$/),
  description: z.string().default(''),
  iconUrl: z.string().url().optional(),
  minecraftVersion: z.string().min(1).max(32),
  loaderType: z.enum(['vanilla', 'forge', 'neoforge', 'fabric', 'quilt']).default('vanilla'),
  loaderVersion: z.string().max(64).optional(),
  javaVersion: z.number().int().min(8).max(25).optional(),
  javaArgs: z.string().optional(),
  serverAddress: z.string().max(255).optional(),
  serverName: z.string().max(128).optional(),
  filePolicies: z.object({
    protected_paths: z.array(z.string()).default(['saves/', 'screenshots/', 'options.txt', 'optionsof.txt', 'usercache.json']),
    optional_mods: z.array(z.string().min(1).max(512).refine(value => sanitizeRelativePath(value).valid)
      .transform(value => sanitizeRelativePath(value).normalizedPath!)).max(1000).default([])
  }).optional(),
  endpointId: z.string().uuid().optional()
});

const InstanceUpdateSchema = InstanceCreateSchema.partial().extend({
  loaderVersion: z.string().max(64).nullable().optional(),
  serverAddress: z.string().max(255).nullable().optional(),
  serverName: z.string().max(128).nullable().optional(),
  iconUrl: z.string().url().nullable().optional()
});

const LauncherSettingsSchema = z.object({
  title: z.string().min(1).max(128).optional(),
  template: z.enum(['minimal', 'community', 'network']).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundUrl: z.string().nullish(),
  logoUrl: z.string().nullish(),
  iconUrl: z.string().nullish(),
  authMicrosoft: z.boolean().optional(),
  authOffline: z.boolean().optional(),
  discordUrl: z.string().nullish(),
  websiteUrl: z.string().nullish(),
  additionalInstanceIds: z.array(z.string().uuid()).optional()
});

function getGameConfig(instance: any) {
  const { minecraft_version, loader_type, loader_version, java_version, java_args, server_address, server_name, file_policies } = instance;
  return { minecraft_version, loader_type, loader_version, java_version, java_args, server_address, server_name, file_policies };
}

function imageMime(buffer: Buffer) {
  if (buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (buffer.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6))) return 'image/gif';
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(buffer.toString('utf8', 0, 512).trimStart())) return 'image/svg+xml';
  return null;
}

export async function instanceRoutes(fastify: FastifyInstance) {
  // Public media download route
  fastify.get('/media/:sha256', async (req, reply) => {
    const { sha256 } = req.params as { sha256: string };
    if (!/^[a-f0-9]{64}$/i.test(sha256)) {
      return reply.status(400).send({ error: 'SHA256 invalide' });
    }

    const casPath = getCasObjectPath(sha256);
    if (!fs.existsSync(casPath)) {
      return reply.status(404).send({ error: 'Image introuvable' });
    }

    if (fs.statSync(casPath).size > 10 * 1024 * 1024) return reply.status(404).send({ error: 'Image introuvable' });
    const buf = fs.readFileSync(casPath);
    const mime = imageMime(buf);
    if (!mime) return reply.status(404).send({ error: 'Image introuvable' });

    return reply
      .header('Content-Type', mime)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "sandbox; default-src 'none'")
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buf);
  });

  // Authenticated routes
  fastify.register(async (authed) => {
    authed.addHook('preHandler', authenticateRequest);
    authed.addHook('preHandler', async (req, reply) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        await requireInstancePermission(req.routeOptions.url?.endsWith('/publish') ? 'can_publish' : 'can_write')(req, reply);
      }
    });

    // 1. List all instances
    authed.get('/instances', async (req, reply) => {
      const res = await query(`
        SELECT i.*,
               e.slug as endpoint_slug,
               e.name as endpoint_name,
               lp.title as launcher_title,
               lp.template as launcher_template,
               lp.accent_color as launcher_accent_color,
               (SELECT release_id FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_release_id,
               (SELECT total_files FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_files,
               (SELECT total_bytes FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_bytes
        FROM instances i
        LEFT JOIN endpoints e ON e.id = i.endpoint_id
        LEFT JOIN launcher_projects lp ON lp.id = i.launcher_project_id
        ORDER BY i.created_at DESC
      `);

      const instances = res.rows.map(inst => ({
        ...inst,
        manifest_url: inst.endpoint_slug ? `${getFilesBaseUrl()}/${inst.endpoint_slug}/packpanel.json` : null
      }));

      return reply.send({ instances });
    });

    // 2. Get single instance with full overview
    authed.get('/instances/:id', async (req, reply) => {
      const { id } = req.params as { id: string };
      const res = await query(`
        SELECT i.*,
               e.slug as endpoint_slug,
               e.name as endpoint_name,
               (SELECT release_id FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_release_id,
               (SELECT total_files FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_files,
               (SELECT total_bytes FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_bytes
        FROM instances i
        LEFT JOIN endpoints e ON e.id = i.endpoint_id
        WHERE i.id::text = $1 OR i.slug = $1
      `, [id]);

      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }

      const inst = res.rows[0];

      // Fetch active release details
      let activeRelease: any = null;
      if (inst.endpoint_id) {
        const relRes = await query(
          'SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1',
          [inst.endpoint_id]
        );
        if (relRes.rows.length > 0) {
          activeRelease = relRes.rows[0];
        }
      }

      // Check for pending staged changes
      let pendingChangesCount = 0;
      if (inst.endpoint_id) {
        const pendingRes = await query(
          `SELECT COUNT(*) FROM upload_files uf
           JOIN upload_sessions us ON us.id = uf.session_id
           WHERE us.endpoint_id = $1 AND us.status IN ('open', 'uploading', 'sealed', 'processing')`,
          [inst.endpoint_id]
        );
        pendingChangesCount = parseInt(pendingRes.rows[0].count, 10);
      }

      // Check if current draft game config differs from active release game config
      const publishedConfig = typeof activeRelease?.game_config === 'string'
        ? JSON.parse(activeRelease.game_config)
        : activeRelease?.game_config;
      const hasDraftConfigChanges = !publishedConfig || !isDeepStrictEqual(getGameConfig(publishedConfig), getGameConfig(inst));
      const workingRelease = inst.endpoint_id ? await getWorkingRelease(inst.endpoint_id) : null;
      const role = req.user!.role;
      const rights = role === 'operator' && inst.endpoint_id ? (await query(
        'SELECT can_write, can_publish FROM user_endpoint_permissions WHERE user_id = $1 AND endpoint_id = $2',
        [req.user!.userId, inst.endpoint_id]
      )).rows[0] : null;
      const permissions = {
        can_write: role === 'admin' || Boolean(rights?.can_write),
        can_publish: role === 'admin' || Boolean(rights?.can_publish)
      };

      // Fetch launcher details if attached
      let launcher: any = null;
      if (inst.launcher_project_id) {
        const lpRes = await query('SELECT * FROM launcher_projects WHERE id = $1', [inst.launcher_project_id]);
        if (lpRes.rows.length > 0) {
          launcher = lpRes.rows[0];
          const buildsRes = await query(
            'SELECT * FROM launcher_builds WHERE launcher_project_id = $1 AND (instance_id = $2 OR instance_id IS NULL) ORDER BY created_at DESC LIMIT 5',
            [launcher.id, inst.id]
          );
          launcher.builds = buildsRes.rows;
        }
      }

      return reply.send({
        instance: {
          ...inst,
          manifest_url: inst.endpoint_slug ? `${getFilesBaseUrl()}/${inst.endpoint_slug}/packpanel.json` : null,
          activeRelease,
          pendingChangesCount,
          hasDraftConfigChanges,
          draft_release_id: workingRelease?.status === 'draft' ? workingRelease.release_id : null,
          player_page_url: `${getFilesBaseUrl()}/play/${encodeURIComponent(inst.slug)}`,
          permissions,
          launcher
        }
      });
    });

    // 3. Create instance (guided & validated)
    authed.post('/instances', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const parsed = InstanceCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const data = parsed.data;

      // Validate combination against catalog
      const validation = await validateCombination(
        data.minecraftVersion,
        data.loaderType,
        data.loaderVersion
      );

      if (!validation.valid) {
        return reply.status(400).send({ error: validation.error || 'Combinaison Minecraft / loader invalide' });
      }

      const resolvedLoaderVersion = validation.resolvedLoaderVersion || null;
      const resolvedJavaVersion = data.javaVersion || validation.javaRequirement.majorVersion;
      if (resolvedJavaVersion < validation.javaRequirement.majorVersion) {
        return reply.status(400).send({ error: `Cette combinaison nécessite Java ${validation.javaRequirement.majorVersion} minimum.` });
      }
      const resolvedJavaArgs = data.javaArgs || validation.javaRequirement.jvmArgs.join(' ');

      // Check slug uniqueness
      const existing = await query('SELECT id FROM instances WHERE slug = $1', [data.slug]);
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: `Une instance avec le slug "${data.slug}" existe déjà.` });
      }
      if (data.endpointId && !(await query('SELECT id FROM endpoints WHERE id = $1', [data.endpointId])).rowCount) {
        return reply.status(404).send({ error: 'Endpoint introuvable' });
      }

      // Auto-create or associate endpoint
      let targetEndpointId = data.endpointId;
      if (!targetEndpointId) {
        const epCheck = await query('SELECT id FROM endpoints WHERE slug = $1', [data.slug]);
        if (epCheck.rows.length > 0) {
          targetEndpointId = epCheck.rows[0].id;
        } else {
          const newEp = await query(
            `INSERT INTO endpoints (slug, name, description, cleanup_rules, auto_publish)
             VALUES ($1, $2, $3, '["mods"]'::jsonb, FALSE)
             RETURNING id`,
            [data.slug, data.name, data.description || '']
          );
          targetEndpointId = newEp.rows[0].id;
          if (req.user!.role !== 'admin') await query('INSERT INTO user_endpoint_permissions (user_id, endpoint_id, can_write, can_publish) VALUES ($1, $2, TRUE, TRUE)', [req.user!.userId, targetEndpointId]);
        }
      }

      if (req.user!.role !== 'admin') {
        const rights = await query('SELECT can_write FROM user_endpoint_permissions WHERE user_id = $1 AND endpoint_id = $2', [req.user!.userId, targetEndpointId]);
        if (!rights.rows[0]?.can_write) return reply.status(403).send({ error: 'Association à cet endpoint non autorisée' });
      }
      const res = await query(
        `INSERT INTO instances (
          name, slug, description, icon_url,
          minecraft_version, loader_type, loader_version,
          java_version, java_args, server_address, server_name,
          file_policies, endpoint_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          data.name,
          data.slug,
          data.description || '',
          data.iconUrl || null,
          data.minecraftVersion,
          data.loaderType,
          resolvedLoaderVersion,
          resolvedJavaVersion,
          resolvedJavaArgs,
          data.serverAddress || null,
          data.serverName || null,
          JSON.stringify(data.filePolicies || {
            protected_paths: ['saves/', 'screenshots/', 'options.txt', 'optionsof.txt', 'usercache.json'],
            optional_mods: []
          }),
          targetEndpointId
        ]
      );

      const instance = res.rows[0];
      await recordAuditLog(req.user!.userId, 'create', 'instance', instance.id, { slug: data.slug }, req.ip);

      return reply.status(201).send({ instance });
    });

    // 4. Update instance settings (Draft)
    authed.put('/instances/:id', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = InstanceUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const data = parsed.data;
      const existing = await query('SELECT * FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (existing.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }

      const current = existing.rows[0];
      const targetId = current.id;
      if (data.endpointId && !(await query('SELECT id FROM endpoints WHERE id = $1', [data.endpointId])).rowCount) {
        return reply.status(404).send({ error: 'Endpoint introuvable' });
      }
      if (data.endpointId && req.user!.role !== 'admin') {
        const rights = await query('SELECT can_write FROM user_endpoint_permissions WHERE user_id = $1 AND endpoint_id = $2', [req.user!.userId, data.endpointId]);
        if (!rights.rows[0]?.can_write) return reply.status(403).send({ error: 'Association à cet endpoint non autorisée' });
      }

      // Validate combination if changing MC version or loader
      const mcVer = data.minecraftVersion || current.minecraft_version;
      const loader = (data.loaderType || current.loader_type) as LoaderType;
      const combinationChanged = data.minecraftVersion !== undefined || data.loaderType !== undefined || data.loaderVersion !== undefined;
      let loaderVer = data.loaderVersion !== undefined ? data.loaderVersion
        : (data.minecraftVersion !== undefined || data.loaderType !== undefined) ? undefined : current.loader_version;
      let javaVer = data.javaVersion ?? current.java_version;

      if (combinationChanged || data.javaVersion !== undefined) {
        const validation = await validateCombination(mcVer, loader, loaderVer || undefined);
        if (!validation.valid) {
          return reply.status(400).send({ error: validation.error || 'Combinaison Minecraft / loader invalide' });
        }
        loaderVer = validation.resolvedLoaderVersion || null;
        javaVer = data.javaVersion ?? validation.javaRequirement.majorVersion;
        if (javaVer < validation.javaRequirement.majorVersion) {
          return reply.status(400).send({ error: `Cette combinaison nécessite Java ${validation.javaRequirement.majorVersion} minimum.` });
        }
      }

      const updated = await query(
        `UPDATE instances
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             icon_url = CASE WHEN $14 THEN $3 ELSE icon_url END,
             minecraft_version = COALESCE($4, minecraft_version),
             loader_type = COALESCE($5, loader_type),
             loader_version = $6,
             java_version = $7,
             java_args = COALESCE($8, java_args),
             server_address = CASE WHEN $15 THEN $9 ELSE server_address END,
             server_name = CASE WHEN $16 THEN $10 ELSE server_name END,
             file_policies = COALESCE($11, file_policies),
             endpoint_id = COALESCE($12, endpoint_id),
             updated_at = NOW()
         WHERE id = $13
         RETURNING *`,
        [
          data.name ?? null,
          data.description ?? null,
          data.iconUrl ?? null,
          data.minecraftVersion ?? null,
          data.loaderType ?? null,
          loaderVer ?? null,
          javaVer,
          data.javaArgs ?? null,
          data.serverAddress ?? null,
          data.serverName ?? null,
          data.filePolicies ? JSON.stringify(data.filePolicies) : null,
          data.endpointId ?? null,
          targetId,
          data.iconUrl !== undefined,
          data.serverAddress !== undefined,
          data.serverName !== undefined
        ]
      );

      const instance = updated.rows[0];
      await recordAuditLog(req.user!.userId, 'update', 'instance', targetId, data, req.ip);
      return reply.send({ instance });
    });

    // 5. Delete instance
    authed.delete('/instances/:id', {
      preHandler: [requireRole(['admin'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const res = await query('DELETE FROM instances WHERE id::text = $1 OR slug = $1 RETURNING id, slug', [id]);
      if (res.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }

      await recordAuditLog(req.user!.userId, 'delete', 'instance', id, { slug: res.rows[0].slug }, req.ip);
      return reply.send({ success: true });
    });

    // 6. Explicit Publish Instance Release
    authed.post('/instances/:id/publish', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z.object({ notes: z.string().trim().max(2000).optional() }).safeParse(req.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'Les notes de version sont limitées à 2 000 caractères.' });
      const releaseNotes = parsed.data.notes || undefined;
      const instRes = await query('SELECT * FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }
      const inst = instRes.rows[0];
      if (!inst.endpoint_id) {
        return reply.status(400).send({ error: "Aucun endpoint de distribution n'est associé à cette instance." });
      }

      // Check if there are uncommitted upload sessions, or publish existing/empty release
      const sessRes = await query(
        `SELECT s.id FROM upload_sessions s
         WHERE endpoint_id = $1 AND status IN ('open', 'uploading', 'sealed', 'processing')
           AND (EXISTS (SELECT 1 FROM upload_files f WHERE f.session_id = s.id) OR source_type = 'zip')
         ORDER BY created_at ASC`,
        [inst.endpoint_id]
      );

      let sessionId: string;
      if (sessRes.rows.length > 0) {
        const pending = await query(`SELECT COUNT(*) FROM jobs WHERE status IN ('pending','running') AND payload->>'sessionId' = ANY($1::text[])`, [sessRes.rows.map(s => s.id)]);
        if (Number(pending.rows[0].count) > 0) return reply.status(409).send({ error: 'Le traitement des fichiers est encore en cours. Réessayez après sa fin.' });
        const invalid = await query(`SELECT COUNT(*) FROM upload_sessions s WHERE id = ANY($1::uuid[]) AND (
          received_files_count < expected_files_count OR EXISTS (SELECT 1 FROM upload_files f WHERE f.session_id = s.id AND f.status <> 'verified'))`, [sessRes.rows.map(s => s.id)]);
        if (Number(invalid.rows[0].count) > 0) return reply.status(409).send({ error: 'Des uploads sont incomplets ou en erreur.' });
        let latestReleaseId = '';
        for (const session of sessRes.rows) {
          latestReleaseId = (await handleSealAndBuildRelease({ sessionId: session.id, immediatePublish: false })).createdReleaseId;
        }
        await handlePublishRelease({ releaseId: latestReleaseId, endpointId: inst.endpoint_id, releaseNotes });
        await recordAuditLog(req.user!.userId, 'publish', 'instance', inst.id, { slug: inst.slug }, req.ip);
        return reply.send({ success: true, message: 'Instance publiée avec succès.' });
      } else {
        const draft = await getWorkingRelease(inst.endpoint_id);
        if (draft?.status === 'draft') {
          await query('UPDATE releases SET game_config = $1 WHERE id = $2', [JSON.stringify(getGameConfig(inst)), draft.id]);
          await handlePublishRelease({ releaseId: draft.id, endpointId: inst.endpoint_id, releaseNotes });
          await recordAuditLog(req.user!.userId, 'publish', 'instance', inst.id, { slug: inst.slug }, req.ip);
          return reply.send({ success: true, message: 'Instance publiée avec succès.' });
        }
        // Create an empty sync session (valid for Vanilla or config updates)
        const newSess = await query(
          `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
           VALUES ($1, $2, 'add_replace', 'manual', 'completed', 0, 0, 0)
           RETURNING id`,
          [inst.endpoint_id, req.user!.userId]
        );
        sessionId = newSess.rows[0].id;
        const staging = path.join(STAGING_DIR, sessionId);
        fs.mkdirSync(staging, { recursive: true, mode: 0o750 });
      }

      await handleSealAndBuildRelease({ sessionId, immediatePublish: true, releaseNotes });

      await recordAuditLog(req.user!.userId, 'publish', 'instance', inst.id, { slug: inst.slug }, req.ip);

      return reply.send({
        success: true,
        message: 'Instance publiée avec succès.'
      });
    });

    // 7. Enable Launcher for Instance
    authed.post('/instances/:id/launcher/enable', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const launcher = await withTransaction(async client => {
        const instRes = await client.query('SELECT * FROM instances WHERE id::text = $1 OR slug = $1 FOR UPDATE', [id]);
        const inst = instRes.rows[0];
        if (!inst) return null;

        let projectId = inst.launcher_project_id;
        if (!projectId) {
          const insert = `INSERT INTO launcher_projects (name, slug, title, template, accent_color, created_by_user_id, distribution_fqdn)
            VALUES ($1, $2, $3, 'community', '#6366f1', $4, $5) ON CONFLICT (slug) DO NOTHING RETURNING id`;
          const values = [inst.name, `${inst.slug.slice(0, 55)}-launcher`, `${inst.name.slice(0, 119)} Launcher`, req.user!.userId, config.FILES_FQDN];
          const preferred = await client.query(insert, values);
          projectId = preferred.rows[0]?.id;
          while (!projectId) {
            values[1] = `launcher-${crypto.randomUUID()}`;
            projectId = (await client.query(insert, values)).rows[0]?.id;
          }
        }
        await client.query(
          `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
           VALUES ($1, $2, TRUE, 0) ON CONFLICT DO NOTHING`, [projectId, inst.id]
        );
        await client.query(
          'UPDATE instances SET launcher_enabled = TRUE, launcher_project_id = $1 WHERE id = $2', [projectId, inst.id]
        );
        return (await client.query('SELECT * FROM launcher_projects WHERE id = $1', [projectId])).rows[0];
      });
      if (!launcher) return reply.status(404).send({ error: 'Instance introuvable' });
      return reply.send({ success: true, launcher });
    });

    // 8. Disable Launcher for Instance
    authed.post('/instances/:id/launcher/disable', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const updated = await query('UPDATE instances SET launcher_enabled = FALSE WHERE id::text = $1 OR slug = $1', [id]);
      if (!updated.rowCount) return reply.status(404).send({ error: 'Instance introuvable' });
      return reply.send({ success: true, message: 'Launcher désactivé pour cette instance' });
    });

    // 9. Update Launcher Settings
    authed.put('/instances/:id/launcher', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const instRes = await query('SELECT * FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }
      const inst = instRes.rows[0];
      if (!inst.launcher_project_id) {
        return reply.status(400).send({ error: "Aucun launcher n'est activé pour cette instance" });
      }

      const parsed = LauncherSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0].message });
      }

      const data = parsed.data;
      const urlValue = (value: string | null | undefined) => value === undefined ? null : value ?? '';
      if (data.additionalInstanceIds?.length) {
        const ids = [...new Set(data.additionalInstanceIds)];
        const linked = await query('SELECT id FROM instances WHERE id = ANY($1::uuid[])', [ids]);
        if (linked.rowCount !== ids.length) return reply.status(400).send({ error: 'Instance associée introuvable' });
      }
      const updated = await withTransaction(async (client) => {
        await client.query('SELECT id FROM launcher_projects WHERE id = $1 FOR UPDATE', [inst.launcher_project_id]);
        if (!await canManageLauncherInstances(req.user!, inst.launcher_project_id, data.additionalInstanceIds, client.query.bind(client) as typeof query)) {
          return null;
        }
        const res = await client.query(
          `UPDATE launcher_projects
           SET title = COALESCE($1, title),
               template = COALESCE($2, template),
               accent_color = COALESCE($3, accent_color),
               background_url = NULLIF(COALESCE($4, background_url), ''),
               logo_url = NULLIF(COALESCE($5, logo_url), ''),
               icon_url = NULLIF(COALESCE($6, icon_url), ''),
               auth_microsoft = COALESCE($7, auth_microsoft),
               auth_offline = COALESCE($8, auth_offline),
               discord_url = NULLIF(COALESCE($9, discord_url), ''),
               website_url = NULLIF(COALESCE($10, website_url), ''),
               updated_at = NOW()
           WHERE id = $11
           RETURNING *`,
          [
            data.title ?? null,
            data.template ?? null,
            data.accentColor ?? null,
            urlValue(data.backgroundUrl),
            urlValue(data.logoUrl),
            urlValue(data.iconUrl),
            data.authMicrosoft ?? null,
            data.authOffline ?? null,
            urlValue(data.discordUrl),
            urlValue(data.websiteUrl),
            inst.launcher_project_id
          ]
        );

        if (data.additionalInstanceIds) {
          // Re-sync instance associations keeping current instance as default
          await client.query('DELETE FROM launcher_project_instances WHERE launcher_project_id = $1', [inst.launcher_project_id]);
          await client.query(
            `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
             VALUES ($1, $2, TRUE, 0)`,
            [inst.launcher_project_id, inst.id]
          );

          let sort = 1;
          for (const extraId of data.additionalInstanceIds) {
            if (extraId !== inst.id) {
              await client.query(
                `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
                 VALUES ($1, $2, FALSE, $3)
                 ON CONFLICT DO NOTHING`,
                [inst.launcher_project_id, extraId, sort++]
              );
            }
          }
        }

        return res.rows[0];
      });

      if (!updated) return reply.status(403).send({ error: 'Droits insuffisants sur les instances du launcher' });
      return reply.send({ launcher: updated });
    });

    // 10. Direct Media Upload for Launcher (Logo, Background, Icon)
    authed.post('/instances/:id/launcher/media', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const data = await req.file({ limits: { fileSize: 10 * 1024 * 1024 } });
      if (!data) {
        return reply.status(400).send({ error: 'Aucun fichier reçu' });
      }

      const buf = await data.toBuffer();
      if (buf.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ error: 'Image trop volumineuse (max 10 Mo)' });
      }
      if (!imageMime(buf)) return reply.status(400).send({ error: 'Format d’image non pris en charge.' });

      const { sha1, sha256 } = hashBuffer(buf);
      await storeBufferInCas(buf, sha256, sha1);

      const origin = req.headers.origin;
      const panelOrigin = origin && URL.canParse(origin) && new URL(origin).host === req.host
        ? new URL(origin).origin
        : req.host === config.ADMIN_FQDN ? `${req.protocol}://${req.host}` : `https://${config.ADMIN_FQDN}`;
      const mediaUrl = `${panelOrigin}/api/v2/media/${sha256}`;
      return reply.send({ url: mediaUrl, sha256 });
    });

    // 11. Trigger Launcher Build
    authed.post('/instances/:id/launcher/build', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z.object({
        targetOs: z.enum(['windows', 'linux', 'macos', 'all']).default('windows'),
        background: z.boolean().default(false),
        artifactFormat: z.enum(['zip', 'installer']).default('zip')
      }).refine(data => data.artifactFormat !== 'installer' || data.targetOs === 'windows').safeParse(req.body ?? {});
      if (!parsed.success) return reply.status(400).send({ error: 'Plateforme ou mode de génération invalide' });
      const { targetOs, background, artifactFormat } = parsed.data;
      const enqueue = background || artifactFormat === 'installer';

      const instRes = await query('SELECT id, endpoint_id, launcher_enabled, launcher_project_id FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      const inst = instRes.rows[0];
      if (!inst?.launcher_enabled || !inst.launcher_project_id) {
        return reply.status(400).send({ error: "Aucun launcher n'est configuré pour cette instance" });
      }

      const build = await reserveLauncherBuild({
        launcherProjectId: inst.launcher_project_id,
        instanceId: inst.id,
        targetOs,
        artifactFormat,
        userId: req.user!.userId
      }, enqueue);
      if (!build) return reply.status(404).send({ error: 'Projet de launcher introuvable' });
      if (build.existing) return reply.status(409).send({ error: 'Une génération est déjà en cours pour cette plateforme.' });
      await recordAuditLog(req.user!.userId, 'build_launcher', 'instance', inst.id, { targetOs, artifactFormat, version: build.version }, req.ip);
      if (enqueue) return reply.status(202).send({ success: true, build });

      const result = await buildLauncherArtifact(build.id, inst.id);
      return reply.status(201).send({ success: true, build: result });
    });

    // 12. List Launcher Builds
    authed.get('/instances/:id/launcher/builds', async (req, reply) => {
      const { id } = req.params as { id: string };
      const instRes = await query('SELECT id, launcher_project_id FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0 || !instRes.rows[0].launcher_project_id) {
        return reply.send({ builds: [] });
      }

      const res = await query(
        `SELECT b.*, u.username as created_by_username
         FROM launcher_builds b
         LEFT JOIN users u ON u.id = b.created_by_user_id
         WHERE b.launcher_project_id = $1 AND (b.instance_id = $2 OR b.instance_id IS NULL)
         ORDER BY (b.shared_at IS NOT NULL) DESC, b.created_at DESC LIMIT 20`,
        [instRes.rows[0].launcher_project_id, instRes.rows[0].id]
      );

      return reply.send({ builds: res.rows });
    });

    authed.put('/instances/:id/launcher/builds/:buildId/share', {
      preHandler: [requireRole(['admin', 'operator']), requireInstancePermission('can_publish')]
    }, async (req, reply) => {
      const { id, buildId } = req.params as { id: string; buildId: string };
      const parsed = z.object({ shared: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return reply.status(400).send({ error: 'État du partage invalide.' });
      const { shared } = parsed.data;
      const result = await withTransaction(async client => {
        const instances = await client.query(
          `SELECT i.id, i.launcher_enabled, i.launcher_project_id,
           EXISTS (SELECT 1 FROM releases r WHERE r.endpoint_id = i.endpoint_id AND r.is_active) AS published
           FROM instances i WHERE i.id::text = $1 OR i.slug = $1 FOR UPDATE`, [id]);
        const instance = instances.rows[0];
        if (!instance) return 'missing';
        const builds = await client.query(
          `SELECT id, target_os, artifact_path FROM launcher_builds
           WHERE id::text = $1 AND instance_id = $2 AND launcher_project_id = $3 AND status = 'completed'`,
          [buildId, instance.id, instance.launcher_project_id]);
        const build = builds.rows[0];
        if (!build) return 'missing';
        if (shared) {
          if (!instance.published || !instance.launcher_enabled || !await launcherArchivePath(build.artifact_path)) return 'unavailable';
          await client.query('UPDATE launcher_builds SET shared_at = NULL WHERE instance_id = $1 AND target_os = $2 AND shared_at IS NOT NULL AND id <> $3',
            [instance.id, build.target_os, build.id]);
        }
        await client.query('UPDATE launcher_builds SET shared_at = CASE WHEN $2 THEN COALESCE(shared_at, NOW()) ELSE NULL END WHERE id = $1',
          [build.id, shared]);
        return 'updated';
      });
      if (result === 'missing') return reply.status(404).send({ error: 'Build introuvable' });
      if (result === 'unavailable') return reply.status(409).send({ error: 'Publiez l’instance et générez un fichier de téléchargement avant de le partager.' });
      await recordAuditLog(req.user!.userId, shared ? 'share_launcher' : 'unshare_launcher', 'launcher_build', buildId, {}, req.ip);
      return reply.send({ success: true });
    });

    // 13. Download Built Artifact
    authed.route<{ Params: { id: string; buildId: string } }>({
      method: ['GET', 'HEAD'],
      url: '/instances/:id/launcher/builds/:buildId/download',
      async handler(req, reply) {
        const { id, buildId } = req.params;
        const buildRes = await query(`SELECT b.artifact_path, b.artifact_sha256 FROM launcher_builds b
           JOIN instances i ON i.launcher_project_id = b.launcher_project_id AND (b.instance_id IS NULL OR b.instance_id = i.id)
           WHERE b.id::text = $1 AND b.status = 'completed' AND (i.id::text = $2 OR i.slug = $2)`, [buildId, id]);
        if (buildRes.rows.length === 0) return reply.status(404).send({ error: 'Build introuvable' });
        return sendLauncherArchive(req, reply, buildRes.rows[0]);
      }
    });

    // 14. Get V2 manifest for instance
    authed.get('/instances/:id/manifest', async (req, reply) => {
      const { id } = req.params as { id: string };
      const manifest = await buildInstanceManifestV2(id);
      if (!manifest) {
        return reply.status(404).send({ error: 'Manifeste introuvable ou aucune version active' });
      }
      return reply.send(manifest);
    });
  });
}

/**
 * Generates and serializes the complete V2 manifest (packpanel.json)
 */
export async function buildInstanceManifestV2(instanceId: string, dbQuery: typeof query = query): Promise<any | null> {
  const instRes = await dbQuery(`
    SELECT i.*, e.slug as endpoint_slug
    FROM instances i
    LEFT JOIN endpoints e ON e.id = i.endpoint_id
    WHERE i.id::text = $1 OR i.slug = $1
  `, [instanceId]);

  if (instRes.rows.length === 0) return null;
  const inst = instRes.rows[0];

  if (!inst.endpoint_id) return null;

  const relRes = await dbQuery(`
    SELECT r.id, r.release_id, r.version_num, r.published_at, r.game_config, r.release_notes
    FROM releases r
    WHERE r.endpoint_id = $1 AND r.is_active = TRUE
    LIMIT 1
  `, [inst.endpoint_id]);

  if (relRes.rows.length === 0) return null;
  const rel = relRes.rows[0];

  // Frozen game config at time of release, or current instance fallback
  const gc = (rel.game_config && typeof rel.game_config === 'object' && Object.keys(rel.game_config).length > 0)
    ? rel.game_config
    : {
        minecraft_version: inst.minecraft_version,
        loader_type: inst.loader_type,
        loader_version: inst.loader_version,
        java_version: inst.java_version,
        java_args: inst.java_args,
        server_address: inst.server_address,
        server_name: inst.server_name,
        file_policies: inst.file_policies
      };

  const filesRes = await dbQuery(`
    SELECT relative_path, sha1, sha256, size_bytes, is_dir
    FROM release_files
    WHERE release_id = $1 AND is_dir = FALSE
    ORDER BY relative_path ASC
  `, [rel.id]);

  const baseUrl = `${getFilesBaseUrl()}/${inst.endpoint_slug}/releases/${rel.release_id}`;

  const files = filesRes.rows.map(f => ({
    path: f.relative_path,
    sha1: f.sha1,
    sha256: f.sha256,
    size: Number(f.size_bytes),
    url: `${baseUrl}/${f.relative_path.split('/').map(encodeURIComponent).join('/')}`,
    policy: 'required'
  }));

  const filePolicies = typeof gc.file_policies === 'string'
    ? JSON.parse(gc.file_policies)
    : (gc.file_policies || {});
  for (const file of files) if (filePolicies.optional_mods?.includes(file.path)) file.policy = 'optional';

  const manifest = {
    formatVersion: 2,
    instanceId: inst.id,
    instanceName: inst.name,
    slug: inst.slug,
    minecraftVersion: gc.minecraft_version,
    loader: {
      type: gc.loader_type,
      version: gc.loader_version || undefined
    },
    java: {
      majorVersion: gc.java_version || 17,
      recommendedMemoryMb: 4096,
      jvmArgs: (gc.java_args || '').split(' ').filter(Boolean)
    },
    server: gc.server_address ? {
      address: gc.server_address,
      name: gc.server_name || undefined
    } : undefined,
    protectedPaths: filePolicies.protected_paths || [
      'saves/',
      'screenshots/',
      'options.txt',
      'optionsof.txt',
      'usercache.json',
      'servers.dat'
    ],
    cleanupRules: ['mods'],
    files,
    releaseId: rel.release_id,
    releaseNotes: rel.release_notes ?? undefined,
    updatedAt: rel.published_at || new Date().toISOString()
  };

  return manifest;
}

/**
 * Writes the packpanel.json manifest statically to the endpoint directory for fast Nginx serving
 */
export async function writeV2ManifestToEndpoint(instanceId: string, dbQuery?: typeof query): Promise<void> {
  if (!dbQuery) {
    await withTransaction(async client => {
      const endpoint = await client.query('SELECT endpoint_id FROM instances WHERE id::text = $1 OR slug = $1', [instanceId]);
      if (!endpoint.rows[0]?.endpoint_id) return;
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('endpoint_pub_' || $1::text))`, [endpoint.rows[0].endpoint_id]);
      await writeV2ManifestToEndpoint(instanceId, client.query.bind(client) as typeof query);
    });
    return;
  }
  const instRes = await dbQuery('SELECT slug, endpoint_id FROM instances WHERE id::text = $1 OR slug = $1', [instanceId]);
  if (instRes.rows.length === 0 || !instRes.rows[0].endpoint_id) return;

  const epRes = await dbQuery('SELECT slug FROM endpoints WHERE id = $1', [instRes.rows[0].endpoint_id]);
  if (epRes.rows.length === 0) return;

  const epSlug = epRes.rows[0].slug;
  const manifest = await buildInstanceManifestV2(instanceId, dbQuery);
  if (!manifest) return;

  const endpointDir = path.join(ENDPOINTS_DIR, epSlug);
  if (!fs.existsSync(endpointDir)) {
    fs.mkdirSync(endpointDir, { recursive: true, mode: 0o755 });
  }

  const targetPath = path.join(endpointDir, 'packpanel.json');
  const tempPath = path.join(endpointDir, `packpanel.json.tmp.${process.pid}.${crypto.randomUUID()}`);

  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.renameSync(tempPath, targetPath);
}
