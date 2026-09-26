import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import path from 'path';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { config, ENDPOINTS_DIR } from '../../config';
import { publishReleaseInternal } from '../../jobs/handlers/publish';

export async function versionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // List all versions of an endpoint
  fastify.get('/endpoints/:id/versions', async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };

    const res = await query(
      `SELECT r.id, r.release_id, r.version_num, r.status, r.is_active, r.is_pinned,
              r.total_files, r.total_bytes, r.created_at, r.published_at,
              u.username as created_by_username
       FROM releases r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       WHERE r.endpoint_id = $1
       ORDER BY r.version_num DESC`,
      [endpointId]
    );

    return reply.send({
      versions: res.rows.map(r => ({
        ...r,
        total_bytes: Number(r.total_bytes)
      }))
    });
  });

  // Get single version details with manifest
  fastify.get('/endpoints/:id/versions/:versionId', async (req, reply) => {
    const { id: endpointId, versionId } = req.params as { id: string; versionId: string };

    const res = await query(
      `SELECT r.*, u.username as created_by_username
       FROM releases r
       LEFT JOIN users u ON u.id = r.created_by_user_id
       WHERE r.endpoint_id = $1 AND (r.id = $2 OR r.release_id = $2)`,
      [endpointId, versionId]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Version introuvable' });
    }

    const version = res.rows[0];
    return reply.send({
      version: {
        ...version,
        total_bytes: Number(version.total_bytes)
      }
    });
  });

  // Toggle version pin
  fastify.post('/endpoints/:id/versions/:versionId/pin', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id: endpointId, versionId } = req.params as { id: string; versionId: string };

    const res = await query(
      `UPDATE releases
       SET is_pinned = NOT is_pinned
       WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)
       RETURNING id, release_id, is_pinned`,
      [endpointId, versionId]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Version introuvable' });
    }

    const updated = res.rows[0];
    await recordAuditLog(req.user!.userId, 'update_pin', 'release', updated.id, {
      endpointId,
      isPinned: updated.is_pinned
    }, req.ip);

    return reply.send({ success: true, isPinned: updated.is_pinned });
  });

  // Atomic Rollback to a specific version
  fastify.post('/endpoints/:id/versions/:versionId/rollback', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id: endpointId, versionId } = req.params as { id: string; versionId: string };

    const epRes = await query('SELECT slug FROM endpoints WHERE id = $1', [endpointId]);
    if (epRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Endpoint introuvable' });
    }
    const endpointSlug = epRes.rows[0].slug;

    const relRes = await query(
      'SELECT * FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)',
      [endpointId, versionId]
    );

    if (relRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Version cible introuvable' });
    }

    const targetRelease = relRes.rows[0];
    const releaseDir = path.join(ENDPOINTS_DIR, endpointSlug, 'releases', targetRelease.release_id);

    const manifestJson = typeof targetRelease.manifest_content === 'string'
      ? targetRelease.manifest_content
      : JSON.stringify(targetRelease.manifest_content, null, 2);

    await publishReleaseInternal(endpointId, targetRelease.id, endpointSlug, manifestJson, releaseDir);

    // Restore instance settings snapshot if available
    if (targetRelease.game_config && typeof targetRelease.game_config === 'object') {
      const gc = typeof targetRelease.game_config === 'string'
        ? JSON.parse(targetRelease.game_config)
        : targetRelease.game_config;

      if (gc.minecraft_version) {
        await query(
          `UPDATE instances
           SET minecraft_version = COALESCE($1, minecraft_version),
               loader_type = COALESCE($2, loader_type),
               loader_version = COALESCE($3, loader_version),
               java_version = COALESCE($4, java_version),
               java_args = COALESCE($5, java_args),
               server_address = COALESCE($6, server_address),
               server_name = COALESCE($7, server_name),
               file_policies = COALESCE($8, file_policies),
               updated_at = NOW()
           WHERE endpoint_id = $9`,
          [
            gc.minecraft_version ?? null,
            gc.loader_type ?? null,
            gc.loader_version ?? null,
            gc.java_version ?? null,
            gc.java_args ?? null,
            gc.server_address ?? null,
            gc.server_name ?? null,
            gc.file_policies ? JSON.stringify(gc.file_policies) : null,
            endpointId
          ]
        );
      }
    }

    await recordAuditLog(req.user!.userId, 'rollback', 'endpoint', endpointId, {
      targetReleaseId: targetRelease.release_id,
      targetReleaseDbId: targetRelease.id
    }, req.ip);

    return reply.send({
      success: true,
      message: `Retour arrière réussi vers la version ${targetRelease.release_id}`,
      activeReleaseId: targetRelease.release_id
    });
  });

  // Diff between two releases
  fastify.get('/endpoints/:id/diff', async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const { base, compare } = req.query as { base: string; compare: string };

    if (!base || !compare) {
      return reply.status(400).send({ error: 'Paramètres base et compare requis' });
    }

    const getFiles = async (relIdOrCode: string) => {
      const rel = await query(
        'SELECT id, release_id, version_num FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)',
        [endpointId, relIdOrCode]
      );
      if (rel.rows.length === 0) return null;

      const files = await query(
        'SELECT relative_path, sha1, sha256, size_bytes, is_dir FROM release_files WHERE release_id = $1',
        [rel.rows[0].id]
      );
      return {
        release: rel.rows[0],
        filesMap: new Map(files.rows.map(f => [f.relative_path, { ...f, size_bytes: Number(f.size_bytes) }]))
      };
    };

    const baseData = await getFiles(base);
    const compData = await getFiles(compare);

    if (!baseData || !compData) {
      return reply.status(404).send({ error: 'Une ou plusieurs versions introuvables' });
    }

    const added: any[] = [];
    const removed: any[] = [];
    const modified: any[] = [];
    let unchangedCount = 0;

    for (const [path, compFile] of compData.filesMap.entries()) {
      if (!baseData.filesMap.has(path)) {
        added.push(compFile);
      } else {
        const baseFile = baseData.filesMap.get(path)!;
        if (baseFile.sha1 !== compFile.sha1) {
          modified.push({
            path,
            isDir: compFile.is_dir,
            oldSha1: baseFile.sha1,
            newSha1: compFile.sha1,
            oldSize: baseFile.size_bytes,
            newSize: compFile.size_bytes
          });
        } else {
          unchangedCount++;
        }
      }
    }

    for (const [path, baseFile] of baseData.filesMap.entries()) {
      if (!compData.filesMap.has(path)) {
        removed.push(baseFile);
      }
    }

    return reply.send({
      baseRelease: baseData.release.release_id,
      compareRelease: compData.release.release_id,
      added,
      removed,
      modified,
      unchangedCount,
      summary: {
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
        totalChanges: added.length + removed.length + modified.length
      }
    });
  });
}
