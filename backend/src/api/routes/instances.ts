import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { config, ENDPOINTS_DIR } from '../../config';

const InstanceCreateSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-_]+$/),
  description: z.string().default(''),
  iconUrl: z.string().url().optional(),
  minecraftVersion: z.string().min(1).max(32),
  loaderType: z.enum(['vanilla', 'forge', 'neoforge', 'fabric', 'quilt']).default('fabric'),
  loaderVersion: z.string().max(64).optional(),
  javaVersion: z.number().int().min(8).max(25).default(17),
  javaArgs: z.string().default('-Xms2G -Xmx4G'),
  serverAddress: z.string().max(255).optional(),
  serverName: z.string().max(128).optional(),
  filePolicies: z.object({
    protected_paths: z.array(z.string()).default(['saves/', 'screenshots/', 'options.txt', 'optionsof.txt', 'usercache.json']),
    optional_mods: z.array(z.string()).default([])
  }).optional(),
  endpointId: z.string().uuid().optional()
});

const InstanceUpdateSchema = InstanceCreateSchema.partial();

export async function instanceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // 1. List all instances
  fastify.get('/instances', async (req, reply) => {
    const res = await query(`
      SELECT i.*,
             e.slug as endpoint_slug,
             e.name as endpoint_name,
             (SELECT release_id FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_release_id,
             (SELECT total_files FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_files,
             (SELECT total_bytes FROM releases WHERE endpoint_id = i.endpoint_id AND is_active = TRUE LIMIT 1) as active_total_bytes
      FROM instances i
      LEFT JOIN endpoints e ON e.id = i.endpoint_id
      ORDER BY i.created_at DESC
    `);

    const instances = res.rows.map(inst => ({
      ...inst,
      manifest_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/packpanel.json` : null,
      legacy_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/index.php` : null
    }));

    return reply.send({ instances });
  });

  // 2. Get single instance
  fastify.get('/instances/:id', async (req, reply) => {
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
    return reply.send({
      instance: {
        ...inst,
        manifest_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/packpanel.json` : null,
        legacy_url: inst.endpoint_slug ? `https://${config.FILES_FQDN}/${inst.endpoint_slug}/index.php` : null
      }
    });
  });

  // 3. Create instance
  fastify.post('/instances', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const parsed = InstanceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const data = parsed.data;

    // Check slug uniqueness
    const existing = await query('SELECT id FROM instances WHERE slug = $1', [data.slug]);
    if (existing.rows.length > 0) {
      return reply.status(409).send({ error: `Une instance avec le slug "${data.slug}" existe déjà.` });
    }

    // Auto-create or associate endpoint if endpointId is null
    let targetEndpointId = data.endpointId;
    if (!targetEndpointId) {
      // Find or create endpoint with matching slug
      const epCheck = await query('SELECT id FROM endpoints WHERE slug = $1', [data.slug]);
      if (epCheck.rows.length > 0) {
        targetEndpointId = epCheck.rows[0].id;
      } else {
        const newEp = await query(
          `INSERT INTO endpoints (slug, name, description, cleanup_rules, auto_publish)
           VALUES ($1, $2, $3, '["mods"]'::jsonb, TRUE)
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
        data.loaderVersion || null,
        data.javaVersion,
        data.javaArgs,
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

  // 4. Update instance
  fastify.put('/instances/:id', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = InstanceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const data = parsed.data;
    const existing = await query('SELECT * FROM instances WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return reply.status(404).send({ error: 'Instance introuvable' });
    }

    const current = existing.rows[0];

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
        id
      ]
    );

    const instance = updated.rows[0];

    // Re-generate packpanel.json manifest if linked endpoint exists
    if (instance.endpoint_id) {
      await writeV2ManifestToEndpoint(instance.id);
    }

    await recordAuditLog(req.user!.userId, 'update', 'instance', id, data, req.ip);
    return reply.send({ instance });
  });

  // 5. Delete instance
  fastify.delete('/instances/:id', {
    preHandler: [requireRole(['admin'])]
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query('DELETE FROM instances WHERE id = $1 RETURNING id, slug', [id]);
    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Instance introuvable' });
    }

    await recordAuditLog(req.user!.userId, 'delete', 'instance', id, { slug: res.rows[0].slug }, req.ip);
    return reply.send({ success: true });
  });

  // 6. Get V2 manifest for instance
  fastify.get('/instances/:id/manifest', async (req, reply) => {
    const { id } = req.params as { id: string };
    const manifest = await buildInstanceManifestV2(id);
    if (!manifest) {
      return reply.status(404).send({ error: 'Manifeste introuvable ou aucune version active' });
    }
    return reply.send(manifest);
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
    SELECT r.id, r.release_id, r.version_num, r.updated_at
    FROM releases r
    WHERE r.endpoint_id = $1 AND r.is_active = TRUE
    LIMIT 1
  `, [inst.endpoint_id]);

  if (relRes.rows.length === 0) return null;
  const rel = relRes.rows[0];

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

  const filePolicies = typeof inst.file_policies === 'string'
    ? JSON.parse(inst.file_policies)
    : (inst.file_policies || {});

  const manifest = {
    formatVersion: 2,
    instanceId: inst.id,
    instanceName: inst.name,
    slug: inst.slug,
    minecraftVersion: inst.minecraft_version,
    loader: {
      type: inst.loader_type,
      version: inst.loader_version || undefined
    },
    java: {
      majorVersion: inst.java_version || 17,
      recommendedMemoryMb: 4096,
      jvmArgs: (inst.java_args || '').split(' ').filter(Boolean)
    },
    server: inst.server_address ? {
      address: inst.server_address,
      name: inst.server_name || undefined
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
    updatedAt: new Date().toISOString()
  };

  return manifest;
}

/**
 * Writes the packpanel.json manifest statically to the endpoint directory for fast Nginx serving
 */
export async function writeV2ManifestToEndpoint(instanceId: string): Promise<void> {
  const instRes = await query('SELECT slug, endpoint_id FROM instances WHERE id = $1', [instanceId]);
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
