import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { config, STAGING_DIR } from '../../config';
import { getCasObjectPath, storeBufferInCas, linkObjectToRelease } from '../../storage/cas';
import { hashBuffer } from '../../storage/hasher';
import { assertSanitizedRelativePath } from '../../storage/paths';
import { handleSealAndBuildRelease } from '../../jobs/handlers/publish';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.json', '.json5', '.toml', '.cfg', '.conf', '.properties',
  '.js', '.ts', '.lua', '.yaml', '.yml', '.md', '.log', '.zs', '.snbt',
  '.lang', '.xml', '.html', '.css', '.ini', '.sh', '.bat', '.cmd'
]);

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'
]);

export async function explorerRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // List files/folders in an endpoint release
  fastify.get('/endpoints/:id/explorer', async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const { releaseId, prefix = '', search = '' } = req.query as {
      releaseId?: string;
      prefix?: string;
      search?: string;
    };

    // Find target release
    let targetRelId: string | null = null;
    let releaseInfo: any = null;

    if (releaseId) {
      const relRes = await query(
        'SELECT * FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)',
        [endpointId, releaseId]
      );
      if (relRes.rows.length > 0) {
        releaseInfo = relRes.rows[0];
        targetRelId = releaseInfo.id;
      }
    } else {
      const relRes = await query(
        'SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1',
        [endpointId]
      );
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
    const params: any[] = [targetRelId];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      itemsQuery += ` AND LOWER(relative_path) LIKE $${params.length}`;
    }

    itemsQuery += ` ORDER BY is_dir DESC, relative_path ASC`;

    const res = await query(itemsQuery, params);

    let items = res.rows;
    if (!search.trim()) {
      const immediateItems = new Map<string, any>();

      for (const row of res.rows) {
        const p = row.relative_path;
        if (normPrefix && !p.startsWith(normPrefix)) continue;

        const subPath = p.slice(normPrefix.length);
        if (!subPath) continue;

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
        } else {
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
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } else {
      items = items.map(r => ({
        path: r.relative_path,
        name: path.basename(r.relative_path),
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
    const { id: endpointId } = req.params as { id: string };
    const { releaseId, path: filePath } = req.query as { releaseId?: string; path?: string };

    if (!filePath) {
      return reply.status(400).send({ error: 'Chemin de fichier requis' });
    }

    let sanitizedPath: string;
    try {
      sanitizedPath = assertSanitizedRelativePath(filePath);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    let targetRelId: string | null = null;
    if (releaseId) {
      const relRes = await query('SELECT id FROM releases WHERE endpoint_id = $1 AND (id = $2 OR release_id = $2)', [endpointId, releaseId]);
      if (relRes.rows.length > 0) targetRelId = relRes.rows[0].id;
    } else {
      const relRes = await query('SELECT id FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1', [endpointId]);
      if (relRes.rows.length > 0) targetRelId = relRes.rows[0].id;
    }

    if (!targetRelId) {
      return reply.status(404).send({ error: 'Version active introuvable' });
    }

    const fileRes = await query(
      'SELECT * FROM release_files WHERE release_id = $1 AND relative_path = $2',
      [targetRelId, sanitizedPath]
    );

    if (fileRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Fichier introuvable dans cette version' });
    }

    const fileRecord = fileRes.rows[0];
    const casPath = getCasObjectPath(fileRecord.sha256);

    if (!fs.existsSync(casPath)) {
      return reply.status(404).send({ error: "L'objet n'existe plus dans le CAS" });
    }

    const ext = path.extname(sanitizedPath).toLowerCase();
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
      const textContent = fs.readFileSync(casPath, 'utf8');
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
      const buffer = fs.readFileSync(casPath);
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
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const schema = z.object({
      path: z.string().min(1),
      content: z.string(),
      commitNow: z.boolean().default(true)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { path: rawPath, content, commitNow } = parsed.data;
    let sanitizedPath: string;
    try {
      sanitizedPath = assertSanitizedRelativePath(rawPath);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    const epRes = await query('SELECT * FROM endpoints WHERE id = $1', [endpointId]);
    if (epRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Endpoint introuvable' });
    }

    const buf = Buffer.from(content, 'utf8');
    const { sha1, sha256 } = hashBuffer(buf);

    await storeBufferInCas(buf, sha256, sha1);


    const sessRes = await query(
      `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, 'add_replace', 'manual', 'completed', 1, 1, 0)
       RETURNING id`,
      [endpointId, req.user!.userId]
    );
    const sessionId = sessRes.rows[0].id;

    const sessionStaging = path.join(STAGING_DIR, sessionId);
    fs.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
    const stagedFile = path.join(sessionStaging, sanitizedPath);
    fs.mkdirSync(path.dirname(stagedFile), { recursive: true, mode: 0o750 });
    fs.writeFileSync(stagedFile, buf);

    await query(
      `INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, sha256, sha1, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')`,
      [sessionId, sanitizedPath, stagedFile, buf.length, buf.length, sha256, sha1]
    );

    if (commitNow) {
      await handleSealAndBuildRelease({ sessionId });
      await recordAuditLog(req.user!.userId, 'edit_file', 'endpoint', endpointId, {
        path: sanitizedPath,
        sha1,
        sha256,
        committed: true
      }, req.ip);
      return reply.send({ success: true, message: 'Fichier enregistré et nouvelle version publiée avec succès' });
    }

    await recordAuditLog(req.user!.userId, 'edit_file', 'endpoint', endpointId, {
      path: sanitizedPath,
      sha1,
      sha256,
      committed: false
    }, req.ip);

    return reply.send({ success: true, message: 'Fichier enregistré en brouillon (session ' + sessionId + ')' });
  });

  // Delete file or directory from active release
  fastify.post('/endpoints/:id/explorer/delete', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const schema = z.object({
      path: z.string().min(1)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const isExplicitDir = parsed.data.path.endsWith('/');
    let targetPath: string;
    try {
      targetPath = assertSanitizedRelativePath(parsed.data.path, isExplicitDir);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    const activeRelRes = await query(
      'SELECT * FROM releases WHERE endpoint_id = $1 AND is_active = TRUE LIMIT 1',
      [endpointId]
    );

    if (activeRelRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Aucune version active trouvée' });
    }

    const activeRelease = activeRelRes.rows[0];

    const filesRes = await query(
      'SELECT relative_path, sha256, sha1, size_bytes, is_dir FROM release_files WHERE release_id = $1',
      [activeRelease.id]
    );

    const remainingFiles = filesRes.rows.filter(f => {
      if (f.relative_path === targetPath) return false;
      if (isExplicitDir && f.relative_path.startsWith(targetPath)) return false;
      return true;
    });

    if (remainingFiles.length === filesRes.rows.length) {
      return reply.status(404).send({ error: 'Élément introuvable dans la version active' });
    }

    const sessRes = await query(
      `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, 'full_replace', 'manual', 'completed', $3, $3, 0)
       RETURNING id`,
      [endpointId, req.user!.userId, remainingFiles.length]
    );
    const sessionId = sessRes.rows[0].id;
    const sessionStaging = path.join(STAGING_DIR, sessionId);
    fs.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });

    for (const f of remainingFiles) {
      await query(
        `INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, sha256, sha1, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified')`,
        [sessionId, f.relative_path, '', f.size_bytes, f.size_bytes, f.sha256, f.sha1]
      );
    }

    await handleSealAndBuildRelease({ sessionId });

    await recordAuditLog(req.user!.userId, 'delete_file', 'endpoint', endpointId, {
      path: targetPath,
      remainingCount: remainingFiles.length
    }, req.ip);

    return reply.send({ success: true, message: 'Élément supprimé et nouvelle version publiée' });
  });
}
