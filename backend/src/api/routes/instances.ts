import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { config, ENDPOINTS_DIR, STAGING_DIR } from '../../config';
import { validateCombination, resolveJavaRequirement, LoaderType } from '../../catalog';
import { handleSealAndBuildRelease } from '../../jobs/handlers/publish';
import { buildLauncherArtifact } from '../../build/launcher-builder';
import { storeBufferInCas, getCasObjectPath } from '../../storage/cas';
import { hashBuffer } from '../../storage/hasher';

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
    optional_mods: z.array(z.string()).default([])
  }).optional(),
  endpointId: z.string().uuid().optional()
});

const InstanceUpdateSchema = InstanceCreateSchema.partial();

const LauncherSettingsSchema = z.object({
  title: z.string().min(1).max(128).optional(),
  template: z.enum(['minimal', 'community', 'network']).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  iconUrl: z.string().optional(),
  authMicrosoft: z.boolean().optional(),
  authOffline: z.boolean().optional(),
  discordUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  additionalInstanceIds: z.array(z.string().uuid()).optional()
});

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

    const buf = fs.readFileSync(casPath);
    // Detect image type from magic numbers
    let mime = 'application/octet-stream';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      mime = 'image/png';
    } else if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      mime = 'image/jpeg';
    } else if (buf.length >= 12 && buf.toString('utf8', 0, 4) === 'RIFF' && buf.toString('utf8', 8, 12) === 'WEBP') {
      mime = 'image/webp';
    } else if (buf.toString('utf8', 0, 4).includes('<svg')) {
      mime = 'image/svg+xml';
    }

    return reply
      .header('Content-Type', mime)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(buf);
  });

  // Authenticated routes
  fastify.register(async (authed) => {
    authed.addHook('preHandler', authenticateRequest);

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
        manifest_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/packpanel.json` : null
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
      let hasDraftConfigChanges = false;
      if (activeRelease && activeRelease.game_config) {
        const gc = typeof activeRelease.game_config === 'string'
          ? JSON.parse(activeRelease.game_config)
          : activeRelease.game_config;

        if (
          gc.minecraft_version !== inst.minecraft_version ||
          gc.loader_type !== inst.loader_type ||
          (gc.loader_version || null) !== (inst.loader_version || null) ||
          gc.java_version !== inst.java_version ||
          (gc.server_address || null) !== (inst.server_address || null)
        ) {
          hasDraftConfigChanges = true;
        }
      } else if (!activeRelease) {
        hasDraftConfigChanges = true;
      }

      // Fetch launcher details if attached
      let launcher: any = null;
      if (inst.launcher_project_id) {
        const lpRes = await query('SELECT * FROM launcher_projects WHERE id = $1', [inst.launcher_project_id]);
        if (lpRes.rows.length > 0) {
          launcher = lpRes.rows[0];
          const buildsRes = await query(
            'SELECT * FROM launcher_builds WHERE launcher_project_id = $1 ORDER BY created_at DESC LIMIT 5',
            [launcher.id]
          );
          launcher.builds = buildsRes.rows;
        }
      }

      return reply.send({
        instance: {
          ...inst,
          manifest_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/packpanel.json` : null,
          activeRelease,
          pendingChangesCount,
          hasDraftConfigChanges,
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
      const resolvedJavaArgs = data.javaArgs || validation.javaRequirement.jvmArgs.join(' ');

      // Check slug uniqueness
      const existing = await query('SELECT id FROM instances WHERE slug = $1', [data.slug]);
      if (existing.rows.length > 0) {
        return reply.status(409).send({ error: `Une instance avec le slug "${data.slug}" existe déjà.` });
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
        }
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

      // Validate combination if changing MC version or loader
      const mcVer = data.minecraftVersion || current.minecraft_version;
      const loader = (data.loaderType || current.loader_type) as LoaderType;
      const loaderVer = data.loaderVersion !== undefined ? data.loaderVersion : current.loader_version;

      if (data.minecraftVersion || data.loaderType || data.loaderVersion) {
        const validation = await validateCombination(mcVer, loader, loaderVer || undefined);
        if (!validation.valid) {
          return reply.status(400).send({ error: validation.error || 'Combinaison Minecraft / loader invalide' });
        }
      }

      const updated = await query(
        `UPDATE instances
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             icon_url = COALESCE($3, icon_url),
             minecraft_version = COALESCE($4, minecraft_version),
             loader_type = COALESCE($5, loader_type),
             loader_version = COALESCE($6, loader_version),
             java_version = COALESCE($7, java_version),
             java_args = COALESCE($8, java_args),
             server_address = COALESCE($9, server_address),
             server_name = COALESCE($10, server_name),
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
          data.loaderVersion ?? null,
          data.javaVersion ?? null,
          data.javaArgs ?? null,
          data.serverAddress ?? null,
          data.serverName ?? null,
          data.filePolicies ? JSON.stringify(data.filePolicies) : null,
          data.endpointId ?? null,
          targetId
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
        `SELECT id FROM upload_sessions
         WHERE endpoint_id = $1 AND status IN ('open', 'uploading', 'sealed')
         ORDER BY created_at DESC LIMIT 1`,
        [inst.endpoint_id]
      );

      let sessionId: string;
      if (sessRes.rows.length > 0) {
        sessionId = sessRes.rows[0].id;
      } else {
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

      await handleSealAndBuildRelease({ sessionId });
      await writeV2ManifestToEndpoint(inst.id);

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
      const instRes = await query('SELECT * FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Instance introuvable' });
      }
      const inst = instRes.rows[0];

      let projectId = inst.launcher_project_id;
      if (!projectId) {
        // Create new launcher project inheriting instance branding
        const lpRes = await query(
          `INSERT INTO launcher_projects (
            name, slug, title, template, accent_color, created_by_user_id, distribution_fqdn
          ) VALUES ($1, $2, $3, 'community', '#6366f1', $4, $5)
          RETURNING id`,
          [inst.name, `${inst.slug}-launcher`, `${inst.name} Launcher`, req.user!.userId, config.FILES_FQDN]
        );
        projectId = lpRes.rows[0].id;

        // Associate primary instance
        await query(
          `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
           VALUES ($1, $2, TRUE, 0)
           ON CONFLICT DO NOTHING`,
          [projectId, inst.id]
        );
      }

      await query(
        `UPDATE instances SET launcher_enabled = TRUE, launcher_project_id = $1 WHERE id = $2`,
        [projectId, inst.id]
      );

      const lp = (await query('SELECT * FROM launcher_projects WHERE id = $1', [projectId])).rows[0];
      return reply.send({ success: true, launcher: lp });
    });

    // 8. Disable Launcher for Instance
    authed.post('/instances/:id/launcher/disable', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      await query('UPDATE instances SET launcher_enabled = FALSE WHERE id::text = $1 OR slug = $1', [id]);
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
      const updated = await withTransaction(async (client) => {
        const res = await client.query(
          `UPDATE launcher_projects
           SET title = COALESCE($1, title),
               template = COALESCE($2, template),
               accent_color = COALESCE($3, accent_color),
               background_url = COALESCE($4, background_url),
               logo_url = COALESCE($5, logo_url),
               icon_url = COALESCE($6, icon_url),
               auth_microsoft = COALESCE($7, auth_microsoft),
               auth_offline = COALESCE($8, auth_offline),
               discord_url = COALESCE($9, discord_url),
               website_url = COALESCE($10, website_url),
               updated_at = NOW()
           WHERE id = $11
           RETURNING *`,
          [
            data.title ?? null,
            data.template ?? null,
            data.accentColor ?? null,
            data.backgroundUrl ?? null,
            data.logoUrl ?? null,
            data.iconUrl ?? null,
            data.authMicrosoft ?? null,
            data.authOffline ?? null,
            data.discordUrl ?? null,
            data.websiteUrl ?? null,
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

      return reply.send({ launcher: updated });
    });

    // 10. Direct Media Upload for Launcher (Logo, Background, Icon)
    authed.post('/instances/:id/launcher/media', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.status(400).send({ error: 'Aucun fichier reçu' });
      }

      const buf = await data.toBuffer();
      if (buf.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ error: 'Image trop volumineuse (max 10 Mo)' });
      }

      const { sha1, sha256 } = hashBuffer(buf);
      await storeBufferInCas(buf, sha256, sha1);

      const mediaUrl = `https://${config.FILES_FQDN || 'mccdn.inferi.fr'}/api/v2/media/${sha256}`;
      return reply.send({ url: mediaUrl, sha256 });
    });

    // 11. Trigger Launcher Build
    authed.post('/instances/:id/launcher/build', {
      preHandler: [requireRole(['admin', 'operator'])]
    }, async (req, reply) => {
      const { id } = req.params as { id: string };
      const { targetOs = 'windows' } = (req.body || {}) as { targetOs?: 'windows' | 'linux' | 'macos' | 'all' };

      const instRes = await query('SELECT launcher_project_id, slug FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0 || !instRes.rows[0].launcher_project_id) {
        return reply.status(400).send({ error: "Aucun launcher n'est configuré pour cette instance" });
      }

      const launcherProjectId = instRes.rows[0].launcher_project_id;
      const buildResult = await buildLauncherArtifact({
        launcherProjectId,
        targetOs,
        userId: req.user!.userId
      });

      await recordAuditLog(req.user!.userId, 'build_launcher', 'instance', id, { targetOs, version: buildResult.version }, req.ip);

      return reply.status(201).send({
        success: true,
        build: buildResult
      });
    });

    // 12. List Launcher Builds
    authed.get('/instances/:id/launcher/builds', async (req, reply) => {
      const { id } = req.params as { id: string };
      const instRes = await query('SELECT launcher_project_id FROM instances WHERE id::text = $1 OR slug = $1', [id]);
      if (instRes.rows.length === 0 || !instRes.rows[0].launcher_project_id) {
        return reply.send({ builds: [] });
      }

      const res = await query(
        `SELECT b.*, u.username as created_by_username
         FROM launcher_builds b
         LEFT JOIN users u ON u.id = b.created_by_user_id
         WHERE b.launcher_project_id = $1
         ORDER BY b.created_at DESC LIMIT 20`,
        [instRes.rows[0].launcher_project_id]
      );

      return reply.send({ builds: res.rows });
    });

    // 13. Download Built Artifact
    authed.get('/instances/:id/launcher/builds/:buildId/download', async (req, reply) => {
      const { buildId } = req.params as { buildId: string };
      const buildRes = await query('SELECT * FROM launcher_builds WHERE id = $1', [buildId]);
      if (buildRes.rows.length === 0) {
        return reply.status(404).send({ error: 'Build introuvable' });
      }

      const build = buildRes.rows[0];
      if (!build.artifact_path || !fs.existsSync(build.artifact_path)) {
        return reply.status(404).send({ error: 'Fichier artefact indisponible sur le serveur' });
      }

      const filename = path.basename(build.artifact_path);
      const stream = fs.createReadStream(build.artifact_path);

      return reply
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Type', 'application/zip')
        .header('Content-Length', build.artifact_size)
        .send(stream);
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
export async function buildInstanceManifestV2(instanceId: string): Promise<any | null> {
  const instRes = await query(`
    SELECT i.*, e.slug as endpoint_slug
    FROM instances i
    LEFT JOIN endpoints e ON e.id = i.endpoint_id
    WHERE i.id::text = $1 OR i.slug = $1
  `, [instanceId]);

  if (instRes.rows.length === 0) return null;
  const inst = instRes.rows[0];

  if (!inst.endpoint_id) return null;

  const relRes = await query(`
    SELECT r.id, r.release_id, r.version_num, r.published_at, r.game_config
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

  const filesRes = await query(`
    SELECT relative_path, sha1, sha256, size_bytes, is_dir
    FROM release_files
    WHERE release_id = $1 AND is_dir = FALSE
    ORDER BY relative_path ASC
  `, [rel.id]);

  const baseUrl = `https://${config.FILES_FQDN}/${inst.endpoint_slug}/releases/${rel.release_id}`;

  const files = filesRes.rows.map(f => ({
    path: f.relative_path,
    sha1: f.sha1,
    sha256: f.sha256,
    size: Number(f.size_bytes),
    url: `${baseUrl}/${encodeURI(f.relative_path)}`,
    policy: 'required'
  }));

  const filePolicies = typeof gc.file_policies === 'string'
    ? JSON.parse(gc.file_policies)
    : (gc.file_policies || {});

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
    updatedAt: rel.published_at || new Date().toISOString()
  };

  return manifest;
}

/**
 * Writes the packpanel.json manifest statically to the endpoint directory for fast Nginx serving
 */
export async function writeV2ManifestToEndpoint(instanceId: string): Promise<void> {
  const instRes = await query('SELECT slug, endpoint_id FROM instances WHERE id::text = $1 OR slug = $1', [instanceId]);
  if (instRes.rows.length === 0 || !instRes.rows[0].endpoint_id) return;

  const epRes = await query('SELECT slug FROM endpoints WHERE id = $1', [instRes.rows[0].endpoint_id]);
  if (epRes.rows.length === 0) return;

  const epSlug = epRes.rows[0].slug;
  const manifest = await buildInstanceManifestV2(instanceId);
  if (!manifest) return;

  const endpointDir = path.join(ENDPOINTS_DIR, epSlug);
  if (!fs.existsSync(endpointDir)) {
    fs.mkdirSync(endpointDir, { recursive: true, mode: 0o755 });
  }

  const targetPath = path.join(endpointDir, 'packpanel.json');
  const tempPath = path.join(endpointDir, `packpanel.json.tmp.${process.pid}.${Date.now()}`);

  fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.renameSync(tempPath, targetPath);
}
