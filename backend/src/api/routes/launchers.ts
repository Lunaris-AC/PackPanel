import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { config } from '../../config';

const LauncherCreateSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-_]+$/),
  title: z.string().min(1).max(128),
  template: z.enum(['minimal', 'community', 'network']).default('minimal'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  backgroundUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  authMicrosoft: z.boolean().default(true),
  authOffline: z.boolean().default(true),
  discordUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  instanceIds: z.array(z.string().uuid()).optional()
});

const LauncherUpdateSchema = LauncherCreateSchema.partial();

export async function launcherRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // 1. List all launcher projects
  fastify.get('/launchers', async (req, reply) => {
    const res = await query(`
      SELECT p.*,
             COUNT(lpi.instance_id) as instance_count,
             (SELECT id FROM launcher_builds WHERE launcher_project_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_build_id,
             (SELECT status FROM launcher_builds WHERE launcher_project_id = p.id ORDER BY created_at DESC LIMIT 1) as latest_build_status
      FROM launcher_projects p
      LEFT JOIN launcher_project_instances lpi ON lpi.launcher_project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    return reply.send({ launchers: res.rows });
  });

  // 2. Get single launcher project with linked instances
  fastify.get('/launchers/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query('SELECT * FROM launcher_projects WHERE id = $1 OR slug = $1', [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Projet de launcher introuvable' });
    }

    const launcher = res.rows[0];

    const instancesRes = await query(`
      SELECT i.*, lpi.is_default, lpi.sort_order, e.slug as endpoint_slug
      FROM launcher_project_instances lpi
      JOIN instances i ON i.id = lpi.instance_id
      LEFT JOIN endpoints e ON e.id = i.endpoint_id
      WHERE lpi.launcher_project_id = $1
      ORDER BY lpi.sort_order ASC, i.name ASC
    `, [launcher.id]);

    const buildsRes = await query(`
      SELECT * FROM launcher_builds
      WHERE launcher_project_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [launcher.id]);

    return reply.send({
      launcher,
      instances: instancesRes.rows.map(inst => ({
        ...inst,
        manifest_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/packpanel.json` : null
      })),
      builds: buildsRes.rows
    });
  });

  // 3. Create launcher project
  fastify.post('/launchers', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const parsed = LauncherCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const data = parsed.data;

    // Check slug uniqueness
    const existing = await query('SELECT id FROM launcher_projects WHERE slug = $1', [data.slug]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: `Un launcher avec le slug "${data.slug}" existe déjà.` });
    }

    const created = await withTransaction(async (client) => {
      const projRes = await client.query(
        `INSERT INTO launcher_projects (
          name, slug, title, template, accent_color,
          background_url, logo_url, icon_url,
          auth_microsoft, auth_offline,
          discord_url, website_url, distribution_fqdn,
          created_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          data.name,
          data.slug,
          data.title,
          data.template,
          data.accentColor,
          data.backgroundUrl || null,
          data.logoUrl || null,
          data.iconUrl || null,
          data.authMicrosoft,
          data.authOffline,
          data.discordUrl || null,
          data.websiteUrl || null,
          config.FILES_FQDN,
          req.user!.userId
        ]
      );

      const proj = projRes.rows[0];

      if (data.instanceIds && data.instanceIds.length > 0) {
        for (let i = 0; i < data.instanceIds.length; i++) {
          await client.query(
            `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [proj.id, data.instanceIds[i], i === 0, i]
          );
        }
      }

      return proj;
    });

    await recordAuditLog(req.user!.userId, 'create', 'launcher_project', created.id, { slug: data.slug }, req.ip);
    return reply.status(201).send({ launcher: created });
  });

  // 4. Update launcher project
  fastify.put('/launchers/:id', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = LauncherUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const data = parsed.data;
    const existing = await query('SELECT * FROM launcher_projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Projet de launcher introuvable' });
    }

    const updated = await withTransaction(async (client) => {
      const res = await client.query(
        `UPDATE launcher_projects
         SET name = COALESCE($1, name),
             title = COALESCE($2, title),
             template = COALESCE($3, template),
             accent_color = COALESCE($4, accent_color),
             background_url = COALESCE($5, background_url),
             logo_url = COALESCE($6, logo_url),
             icon_url = COALESCE($7, icon_url),
             auth_microsoft = COALESCE($8, auth_microsoft),
             auth_offline = COALESCE($9, auth_offline),
             discord_url = COALESCE($10, discord_url),
             website_url = COALESCE($11, website_url),
             updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [
          data.name ?? null,
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
          id
        ]
      );

      if (data.instanceIds) {
        await client.query('DELETE FROM launcher_project_instances WHERE launcher_project_id = $1', [id]);
        for (let i = 0; i < data.instanceIds.length; i++) {
          await client.query(
            `INSERT INTO launcher_project_instances (launcher_project_id, instance_id, is_default, sort_order)
             VALUES ($1, $2, $3, $4)`,
            [id, data.instanceIds[i], i === 0, i]
          );
        }
      }

      return res.rows[0];
    });

    await recordAuditLog(req.user!.userId, 'update', 'launcher_project', id, data, req.ip);
    return reply.send({ launcher: updated });
  });

  // 5. Delete launcher project
  fastify.delete('/launchers/:id', {
    preHandler: [requireRole(['admin'])]
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query('DELETE FROM launcher_projects WHERE id = $1 RETURNING id, slug', [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Projet introuvable' });
    }

    await recordAuditLog(req.user!.userId, 'delete', 'launcher_project', id, { slug: res.rows[0].slug }, req.ip);
    return reply.send({ success: true });
  });

  // 6. Get launcher client configuration JSON
  fastify.get('/launchers/:id/config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query('SELECT * FROM launcher_projects WHERE id = $1 OR slug = $1', [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Projet introuvable' });
    }

    const launcher = res.rows[0];
    const instancesRes = await query(`
      SELECT i.id, i.name, i.slug, i.icon_url, lpi.is_default, e.slug as endpoint_slug
      FROM launcher_project_instances lpi
      JOIN instances i ON i.id = lpi.instance_id
      LEFT JOIN endpoints e ON e.id = i.endpoint_id
      WHERE lpi.launcher_project_id = $1
      ORDER BY lpi.sort_order ASC
    `, [launcher.id]);

    const launcherConfig = {
      formatVersion: 2,
      launcherId: launcher.id,
      name: launcher.name,
      slug: launcher.slug,
      template: launcher.template,
      branding: {
        title: launcher.title,
        accentColor: launcher.accent_color,
        backgroundUrl: launcher.background_url || undefined,
        logoUrl: launcher.logo_url || undefined,
        iconUrl: launcher.icon_url || undefined,
        discordUrl: launcher.discord_url || undefined,
        websiteUrl: launcher.website_url || undefined
      },
      auth: {
        microsoft: launcher.auth_microsoft,
        offline: launcher.auth_offline
      },
      instances: instancesRes.rows.map(inst => ({
        id: inst.id,
        slug: inst.slug,
        name: inst.name,
        manifestUrl: `https://${config.FILES_FQDN}/${inst.endpoint_slug || inst.slug}/packpanel.json`,
        isDefault: inst.is_default,
        iconUrl: inst.icon_url || undefined
      }))
    };

    return reply.send(launcherConfig);
  });
}
