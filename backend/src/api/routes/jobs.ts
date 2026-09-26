import { FastifyInstance } from 'fastify';
import { query } from '../../db';
import { authenticateRequest, requireRole } from '../../auth/middleware';

export async function jobRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // List recent jobs
  fastify.get('/jobs', async (req, reply) => {
    const { status, limit = 50 } = req.query as { status?: string; limit?: number };

    let q = `
      SELECT id, job_type, status, priority, attempts, max_attempts,
             error_message, created_at, started_at, completed_at
      FROM jobs
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      q += ` WHERE status = $1`;
    }

    q += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(Math.min(Number(limit) || 50, 100));

    const res = await query(q, params);
    return reply.send({ jobs: res.rows });
  });

  // Get job details
  fastify.get('/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query('SELECT * FROM jobs WHERE id = $1', [id]);

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Tâche introuvable' });
    }

    return reply.send({ job: res.rows[0] });
  });

  // Cancel a pending job
  fastify.post('/jobs/:id/cancel', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await query(
      `UPDATE jobs
       SET status = 'cancelled', completed_at = NOW(), error_message = 'Annulé manuellement par utilisateur'
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [id]
    );

    if (res.rows.length === 0) {
      return reply.status(400).send({ error: 'Impossible d’annuler la tâche (elle n’est plus en attente ou est introuvable)' });
    }

    return reply.send({ success: true, message: 'Tâche annulée' });
  });
}
