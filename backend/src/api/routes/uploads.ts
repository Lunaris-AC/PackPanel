import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Server as TusServer } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { query, withTransaction } from '../../db';
import { authenticateRequest, requireRole, requireEndpointPermission, recordAuditLog } from '../../auth/middleware';
import { config, STAGING_DIR } from '../../config';
import { enqueueJob } from '../../jobs/queue';
import { assertSanitizedRelativePath } from '../../storage/paths';

// Setup TUS file store in a subfolder of staging
const tusUploadDir = path.join(STAGING_DIR, 'tus_chunks');
if (!fs.existsSync(tusUploadDir)) {
  fs.mkdirSync(tusUploadDir, { recursive: true, mode: 0o750 });
}

export const tusServer = new TusServer({
  path: '/api/uploads/tus',
  datastore: new FileStore({ directory: tusUploadDir }),
  namingFunction: (req) => {
    return `tus_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  },
  onUploadFinish: async (req, res, upload) => {
    const tusFilePath = path.join(tusUploadDir, upload.id);
    try {
      const metadata = upload.metadata || {};
      const endpointId = metadata.endpointId;
      const sessionId = metadata.sessionId;
      const relativePathRaw = metadata.relativePath || upload.id;
      const isZip = metadata.isZip === 'true';

      if (!endpointId || !sessionId) {
        if (fs.existsSync(tusFilePath)) fs.unlinkSync(tusFilePath);
        return res;
      }

      // Verify that upload session exists and matches the specified endpoint
      const sessionRes = await query(
        'SELECT * FROM upload_sessions WHERE id = $1 AND endpoint_id = $2',
        [sessionId, endpointId]
      );
      if (sessionRes.rows.length === 0) {
        if (fs.existsSync(tusFilePath)) fs.unlinkSync(tusFilePath);
        return res;
      }

      const session = sessionRes.rows[0];
      // Reject uploads to sessions that are already sealed, processing, or completed
      if (session.status !== 'uploading' && session.status !== 'open') {
        if (fs.existsSync(tusFilePath)) fs.unlinkSync(tusFilePath);
        return res;
      }

      const sessionStagingDir = path.join(STAGING_DIR, sessionId);
      if (!fs.existsSync(sessionStagingDir)) {
        fs.mkdirSync(sessionStagingDir, { recursive: true, mode: 0o750 });
      }

      if (isZip) {
        const destZipPath = path.join(sessionStagingDir, 'upload.zip');
        fs.renameSync(tusFilePath, destZipPath);

        await enqueueJob('extract_zip_import', {
          sessionId,
          endpointId,
          zipPath: destZipPath,
          mode: session.mode
        }, 5);

        await query(
          'UPDATE upload_sessions SET total_files = 1, received_files_count = 1, updated_at = NOW() WHERE id = $1',
          [sessionId]
        );
      } else {
        const sanitized = assertSanitizedRelativePath(relativePathRaw);
        const destFilePath = path.join(sessionStagingDir, sanitized);
        const destDir = path.dirname(destFilePath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true, mode: 0o750 });
        }
        fs.renameSync(tusFilePath, destFilePath);

        const stat = fs.statSync(destFilePath);
        const fileInsert = await query(
          `INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, status)
           VALUES ($1, $2, $3, $4, $5, 'staged')
           ON CONFLICT (session_id, relative_path) DO UPDATE
             SET staging_path = EXCLUDED.staging_path,
                 size_bytes = EXCLUDED.size_bytes,
                 received_size = EXCLUDED.received_size,
                 status = 'staged',
                 updated_at = NOW()
           RETURNING id`,
          [sessionId, sanitized, destFilePath, stat.size, stat.size]
        );

        await enqueueJob('process_upload_file', {
          uploadFileId: fileInsert.rows[0].id,
          sessionId,
          stagingPath: destFilePath,
          relativePath: sanitized
        }, 3);

        await query(
          `UPDATE upload_sessions
           SET total_files = total_files + 1,
               received_files_count = received_files_count + 1,
               updated_at = NOW()
           WHERE id = $1`,
          [sessionId]
        );
      }
    } catch (err) {
      console.error('Erreur dans le callback tus onUploadFinish :', err);
      if (fs.existsSync(tusFilePath)) {
        try { fs.unlinkSync(tusFilePath); } catch (e) {}
      }
    }
    return res;
  }
});

export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // 1. Create a new upload session
  fastify.post('/endpoints/:id/uploads/sessions', {
    preHandler: [requireRole(['admin', 'operator']), requireEndpointPermission('can_write')]
  }, async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const schema = z.object({
      mode: z.enum(['add_replace', 'full_replace']).default('add_replace'),
      sourceType: z.enum(['manual', 'zip', 'folder', 'watched']).default('manual'),
      expectedFilesCount: z.number().int().nonnegative().optional().default(0)
    });

    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { mode, sourceType, expectedFilesCount } = parsed.data;

    // Verify endpoint exists
    const epRes = await query('SELECT id FROM endpoints WHERE id = $1', [endpointId]);
    if (epRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Endpoint introuvable' });
    }

    const res = await query(
      `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files, expected_files_count, received_files_count)
       VALUES ($1, $2, $3, $4, 'uploading', 0, 0, 0, $5, 0)
       RETURNING *`,
      [endpointId, req.user!.userId, mode, sourceType, expectedFilesCount]
    );

    const session = res.rows[0];
    const sessionStaging = path.join(STAGING_DIR, session.id);
    if (!fs.existsSync(sessionStaging)) {
      fs.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
    }

    await recordAuditLog(req.user!.userId, 'create', 'upload_session', session.id, { endpointId, mode, sourceType, expectedFilesCount }, req.ip);

    return reply.status(201).send({ session });
  });

  // 2. List sessions for an endpoint
  fastify.get('/endpoints/:id/uploads/sessions', async (req, reply) => {
    const { id: endpointId } = req.params as { id: string };
    const res = await query(
      `SELECT s.*, u.username as user_name
       FROM upload_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.endpoint_id = $1
       ORDER BY s.created_at DESC
       LIMIT 30`,
      [endpointId]
    );

    return reply.send({ sessions: res.rows });
  });

  // 3. Get single session status
  fastify.get('/endpoints/:id/uploads/sessions/:sessionId', async (req, reply) => {
    const { id: endpointId, sessionId } = req.params as { id: string; sessionId: string };

    const sessionRes = await query(
      `SELECT s.*, u.username as user_name
       FROM upload_sessions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.endpoint_id = $2`,
      [sessionId, endpointId]
    );

    if (sessionRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Session introuvable' });
    }

    const filesRes = await query(
      `SELECT id, relative_path, size_bytes, status, error_message, updated_at
       FROM upload_files
       WHERE session_id = $1
       ORDER BY updated_at DESC
       LIMIT 100`,
      [sessionId]
    );

    return reply.send({
      session: sessionRes.rows[0],
      files: filesRes.rows
    });
  });

  // 4. Commit session -> triggers release build & publication
  fastify.post('/endpoints/:id/uploads/sessions/:sessionId/commit', {
    preHandler: [requireRole(['admin', 'operator']), requireEndpointPermission('can_publish')]
  }, async (req, reply) => {
    const { id: endpointId, sessionId } = req.params as { id: string; sessionId: string };

    const sessionRes = await query(
      `SELECT s.*, e.slug
       FROM upload_sessions s
       JOIN endpoints e ON e.id = s.endpoint_id
       WHERE s.id = $1 AND s.endpoint_id = $2`,
      [sessionId, endpointId]
    );

    if (sessionRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Session introuvable' });
    }

    const session = sessionRes.rows[0];
    if (session.status !== 'uploading' && session.status !== 'open') {
      return reply.status(400).send({ error: `La session ne peut pas être scellée car elle est dans l'état: ${session.status}` });
    }

    // Verify expected file count if declared
    if (session.expected_files_count > 0 && session.total_files < session.expected_files_count) {
      return reply.status(400).send({
        error: `Session incomplète : ${session.total_files}/${session.expected_files_count} fichier(s) reçu(s). Veuillez attendre que tous les fichiers soient téléversés.`
      });
    }

    // Check if there are pending hashing or processing jobs
    const pendingFiles = await query(
      `SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status NOT IN ('verified', 'failed')`,
      [sessionId]
    );
    const pendingCount = parseInt(pendingFiles.rows[0].count, 10);
    if (pendingCount > 0) {
      return reply.status(400).send({
        error: `Il reste ${pendingCount} fichier(s) en cours de traitement. Veuillez patienter avant de publier.`
      });
    }

    // Mark session as sealed before queuing release build
    await query(`UPDATE upload_sessions SET status = 'sealed', updated_at = NOW() WHERE id = $1`, [sessionId]);

    // Enqueue seal and build job
    const job = await enqueueJob('seal_and_build_release', { sessionId }, 10);

    await recordAuditLog(req.user!.userId, 'publish', 'upload_session', sessionId, { jobId: job.id }, req.ip);

    return reply.send({ success: true, jobId: job.id });
  });

  // 5. Direct single/multipart upload
  fastify.post('/endpoints/:id/uploads/direct', {
    preHandler: [requireRole(['admin', 'operator']), requireEndpointPermission('can_write')]
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: endpointId } = req.params as { id: string };

    if (!req.isMultipart()) {
      return reply.status(400).send({ error: 'Requête multipart/form-data requise' });
    }

    const parts = req.parts();
    let sessionId: string | null = null;
    let relPath: string | null = null;
    let fileUploaded = false;

    let fields: Record<string, string> = {};

    for await (const part of parts) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value as string;
        if (part.fieldname === 'sessionId') sessionId = part.value as string;
        if (part.fieldname === 'relativePath') relPath = part.value as string;
      } else if (part.type === 'file') {
        if (!sessionId) {
          sessionId = fields.sessionId;
        }

        if (!sessionId) {
          const newSess = await query(
            `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
             VALUES ($1, $2, 'add_replace', 'manual', 'uploading', 0, 0, 0)
             RETURNING id`,
            [endpointId, req.user!.userId]
          );
          sessionId = newSess.rows[0].id;
        }

        if (!sessionId) {
          throw new Error('Identifiant de session manquant');
        }
        const activeSessionId: string = sessionId;

        const rawTarget: string = (relPath || fields.relativePath || part.filename || 'unnamed') as string;
        const effectiveRelPath = assertSanitizedRelativePath(rawTarget);

        const sessionStaging = path.join(STAGING_DIR, activeSessionId);
        if (!fs.existsSync(sessionStaging)) {
          fs.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });
        }

        const targetFilePath = path.join(sessionStaging, effectiveRelPath);

        const targetDir = path.dirname(targetFilePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
        }

        const writeStream = fs.createWriteStream(targetFilePath);
        await new Promise<void>((resolve, reject) => {
          part.file.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });

        const stat = fs.statSync(targetFilePath);

        const fileRes = await query(
          `INSERT INTO upload_files (session_id, relative_path, staging_path, size_bytes, received_size, status)
           VALUES ($1, $2, $3, $4, $5, 'staged')
           ON CONFLICT (session_id, relative_path) DO UPDATE
             SET staging_path = EXCLUDED.staging_path,
                 size_bytes = EXCLUDED.size_bytes,
                 received_size = EXCLUDED.received_size,
                 status = 'staged',
                 updated_at = NOW()
           RETURNING id`,
          [sessionId, effectiveRelPath, targetFilePath, stat.size, stat.size]
        );

        await enqueueJob('process_upload_file', {
          uploadFileId: fileRes.rows[0].id,
          sessionId,
          stagingPath: targetFilePath,
          relativePath: effectiveRelPath
        }, 3);

        await query('UPDATE upload_sessions SET total_files = total_files + 1, updated_at = NOW() WHERE id = $1', [sessionId]);
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
    preHandler: [requireRole(['admin', 'operator']), requireEndpointPermission('can_write')]
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: endpointId } = req.params as { id: string };

    if (!req.isMultipart()) {
      return reply.status(400).send({ error: 'Requête multipart/form-data requise' });
    }

    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ error: 'Aucun fichier archive ZIP reçu' });
    }

    const mode = (data.fields.mode as any)?.value === 'full_replace' ? 'full_replace' : 'add_replace';

    const epRes = await query('SELECT id FROM endpoints WHERE id = $1', [endpointId]);
    if (epRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Endpoint introuvable' });
    }

    const sessRes = await query(
      `INSERT INTO upload_sessions (endpoint_id, user_id, mode, source_type, status, total_files, processed_files, failed_files)
       VALUES ($1, $2, $3, 'zip', 'uploading', 1, 0, 0)
       RETURNING id`,
      [endpointId, req.user!.userId, mode]
    );
    const sessionId = sessRes.rows[0].id;
    const sessionStaging = path.join(STAGING_DIR, sessionId);
    fs.mkdirSync(sessionStaging, { recursive: true, mode: 0o750 });

    const zipFilePath = path.join(sessionStaging, 'upload.zip');
    const writeStream = fs.createWriteStream(zipFilePath);

    await new Promise<void>((resolve, reject) => {
      data.file.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const job = await enqueueJob('extract_zip_import', {
      sessionId,
      endpointId,
      zipPath: zipFilePath,
      mode
    }, 5);

    await recordAuditLog(req.user!.userId, 'upload_zip', 'endpoint', endpointId, { sessionId, jobId: job.id, mode }, req.ip);

    return reply.status(202).send({
      message: 'Archive ZIP reçue, extraction et validation en cours',
      sessionId,
      jobId: job.id
    });
  });
}
