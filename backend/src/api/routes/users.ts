import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';
import { hashPassword } from '../../auth/argon2';

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // 1. List users (Admin only)
  fastify.get('/users', { preHandler: [requireRole(['admin'])] }, async (req, reply) => {
    const res = await query(
      `SELECT id, username, role, created_at, last_login_at
       FROM users
       ORDER BY created_at ASC`
    );
    return reply.send({ users: res.rows });
  });

  // 2. Create user (Admin only)
  fastify.post('/users', { preHandler: [requireRole(['admin'])] }, async (req, reply) => {
    const schema = z.object({
      username: z.string().min(3).max(64),
      password: z.string().min(8).max(128),
      role: z.enum(['admin', 'operator', 'viewer']).default('operator')
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { username, password, role } = parsed.data;

    const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return reply.status(400).send({ error: `L'utilisateur "${username}" existe déjà` });
    }

    const passwordHash = await hashPassword(password);
    const res = await query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, username, role, created_at`,
      [username, passwordHash, role]
    );

    const newUser = res.rows[0];
    await recordAuditLog(req.user!.userId, 'create', 'user', newUser.id, { username, role }, req.ip);

    return reply.status(201).send({ user: newUser });
  });

  // 3. Update user (Admin only)
  fastify.put('/users/:id', { preHandler: [requireRole(['admin'])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({
      role: z.enum(['admin', 'operator', 'viewer']).optional(),
      password: z.string().min(8).max(128).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { role, password } = parsed.data;

    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await hashPassword(password);
    }

    const res = await query(
      `UPDATE users
       SET role = COALESCE($1, role),
           password_hash = COALESCE($2, password_hash),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, username, role, updated_at`,
      [role, passwordHash, id]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'Utilisateur introuvable' });
    }

    await recordAuditLog(req.user!.userId, 'update', 'user', id, { role, passwordChanged: !!password }, req.ip);

    return reply.send({ user: res.rows[0] });
  });

  // 4. Delete user (Admin only)
  fastify.delete('/users/:id', { preHandler: [requireRole(['admin'])] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    if (id === req.user!.userId) {
      return reply.status(400).send({ error: 'Impossible de supprimer votre propre compte' });
    }

    // Check if it's the last admin
    const adminsCount = await query(`SELECT COUNT(*) FROM users WHERE role = 'admin'`);
    const targetUser = await query(`SELECT role, username FROM users WHERE id = $1`, [id]);

    if (targetUser.rows.length === 0) {
      return reply.status(404).send({ error: 'Utilisateur introuvable' });
    }

    if (targetUser.rows[0].role === 'admin' && parseInt(adminsCount.rows[0].count, 10) <= 1) {
      return reply.status(400).send({ error: 'Impossible de supprimer le dernier administrateur' });
    }

    await query('DELETE FROM users WHERE id = $1', [id]);
    await recordAuditLog(req.user!.userId, 'delete', 'user', id, { username: targetUser.rows[0].username }, req.ip);

    return reply.send({ success: true });
  });

  // 5. Audit logs (Admin only)
  fastify.get('/audit-logs', { preHandler: [requireRole(['admin'])] }, async (req, reply) => {
    const { limit = 50, offset = 0 } = req.query as { limit?: number; offset?: number };

    const res = await query(
      `SELECT a.*, u.username as user_name
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Math.min(Number(limit) || 50, 100), Number(offset) || 0]
    );

    const countRes = await query('SELECT COUNT(*) FROM audit_logs');

    return reply.send({
      total: parseInt(countRes.rows[0].count, 10),
      logs: res.rows
    });
  });
}
