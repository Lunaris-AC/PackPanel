import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../../db';

const instanceId = z.string().uuid();
const backupSchema = z.object({
  revision: z.number().int().min(0).max(2147483646),
  payload: z.string().min(39).max(180_000).regex(/^[A-Za-z0-9_-]+$/)
});
const reportSchema = z.object({
  id: z.string().uuid(),
  player: z.string().regex(/^[A-Za-z0-9_]{1,16}$/),
  exitCode: z.number().int().min(-2147483648).max(2147483647),
  log: z.string().min(1).max(60_000)
});

function backupOwner(authorization?: string) {
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
  return token && createHash('sha256').update(token).digest('hex');
}

export async function playerServicesRoutes(server: FastifyInstance) {
  server.addHook('onRequest', async (_req, reply) => {
    reply.header('Cache-Control', 'private, no-store').header('X-Robots-Tag', 'noindex');
  });

  server.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    if (!instanceId.safeParse(req.params.id).success) return reply.code(404).send();
    const result = await query(
      'SELECT player_options_backup FROM instances WHERE id = $1 AND launcher_enabled',
      [req.params.id]
    );
    if (!result.rows[0]) return reply.code(404).send();
    return { backupEnabled: result.rows[0].player_options_backup };
  });

  server.get<{ Params: { id: string } }>('/:id/options', async (req, reply) => {
    const owner = backupOwner(req.headers.authorization);
    if (!owner) return reply.code(401).send();
    if (!instanceId.safeParse(req.params.id).success) return reply.code(404).send();
    const result = await query(
      `SELECT b.revision, b.payload FROM instances i
       LEFT JOIN player_options_backups b ON b.instance_id = i.id AND b.owner = $2
       WHERE i.id = $1 AND i.launcher_enabled AND i.player_options_backup`,
      [req.params.id, owner]
    );
    if (!result.rows[0]) return reply.code(404).send();
    return result.rows[0].revision === null ? { revision: 0 } : result.rows[0];
  });

  server.put<{ Params: { id: string } }>('/:id/options', { bodyLimit: 184_000 }, async (req, reply) => {
    const owner = backupOwner(req.headers.authorization);
    if (!owner) return reply.code(401).send();
    if (!instanceId.safeParse(req.params.id).success) return reply.code(404).send();
    const parsed = backupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send();
    const id = req.params.id;
    const { payload, revision } = parsed.data;
    const status = await withTransaction(async client => {
      const instance = await client.query(
        'SELECT id FROM instances WHERE id = $1 AND launcher_enabled AND player_options_backup FOR UPDATE', [id]
      );
      if (!instance.rowCount) return 404;

      if (revision === 0) {
        const quota = await client.query('SELECT COUNT(*) < 5000 AS available FROM player_options_backups WHERE instance_id = $1', [id]);
        if (!quota.rows[0].available) return 429;
        const result = await client.query(
          `INSERT INTO player_options_backups (instance_id, owner, revision, payload) VALUES ($1, $2, 1, $3)
           ON CONFLICT DO NOTHING`, [id, owner, payload]
        );
        return result.rowCount ? 200 : 409;
      }

      const result = await client.query(
        `UPDATE player_options_backups SET revision = revision + 1, payload = $3
         WHERE instance_id = $1 AND owner = $2 AND revision = $4`, [id, owner, payload, revision]
      );
      return result.rowCount ? 200 : 409;
    });
    if (status !== 200) return reply.code(status).send();
    return { revision: revision + 1 };
  });

  server.post<{ Params: { id: string } }>('/:id/game-logs', { bodyLimit: 370_000 }, async (req, reply) => {
    if (!instanceId.safeParse(req.params.id).success) return reply.code(404).send();
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success || Buffer.byteLength(parsed.data.log) > 120_000) return reply.code(400).send();
    const id = req.params.id;
    const report = parsed.data;
    const enabled = await withTransaction(async client => {
      const instance = await client.query('SELECT id FROM instances WHERE id = $1 AND launcher_enabled FOR UPDATE', [id]);
      if (!instance.rowCount) return false;
      await client.query(
        `INSERT INTO player_game_logs (instance_id, id, player, exit_code, log)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [id, report.id, report.player, report.exitCode, report.log.replace(/\0/g, '')]
      );
      await client.query(
        `DELETE FROM player_game_logs WHERE instance_id = $1 AND id IN (
           SELECT id FROM player_game_logs WHERE instance_id = $1 ORDER BY created_at DESC, id DESC OFFSET 200
         )`, [id]
      );
      return true;
    });
    return reply.code(enabled ? 204 : 404).send();
  });
}
