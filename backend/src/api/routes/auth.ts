import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db';
import { verifyPassword, hashPassword } from '../../auth/argon2';
import { createSession, revokeSession, SESSION_COOKIE_NAME } from '../../auth/tokens';
import { authenticateRequest, recordAuditLog } from '../../auth/middleware';

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/login', async (req, reply) => {
    const bodySchema = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Identifiants invalides' });
    }

    const { username, password } = parsed.data;

    const res = await query('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username]);
    if (res.rows.length === 0) {
      return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
    }

    const user = res.rows[0];
    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
    }

    const ip = req.ip;
    const ua = req.headers['user-agent'];
    const { sessionId, token } = await createSession(user.id, ip, ua);

    // Set HttpOnly, SameSite=Lax cookie
    reply.setCookie(SESSION_COOKIE_NAME, `${sessionId}:${token}`, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    await recordAuditLog(user.id, 'login', 'user', user.id, { username }, ip);

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      token: `${sessionId}:${token}`
    });
  });

  // Logout
  fastify.post('/logout', { preHandler: [authenticateRequest] }, async (req, reply) => {
    if (req.user) {
      await revokeSession(req.user.sessionId);
      await recordAuditLog(req.user.userId, 'logout', 'user', req.user.userId, {}, req.ip);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.send({ success: true });
  });

  // Me (current authenticated user)
  fastify.get('/me', { preHandler: [authenticateRequest] }, async (req, reply) => {
    return reply.send({ user: req.user });
  });

  // Update password
  fastify.put('/password', { preHandler: [authenticateRequest] }, async (req, reply) => {
    const bodySchema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { currentPassword, newPassword } = parsed.data;
    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.userId]);
    const valid = await verifyPassword(userRes.rows[0].password_hash, currentPassword);
    if (!valid) {
      return reply.status(400).send({ error: 'Mot de passe actuel incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.userId]);
    await recordAuditLog(req.user!.userId, 'password_change', 'user', req.user!.userId, {}, req.ip);

    return reply.send({ success: true, message: 'Mot de passe mis à jour avec succès' });
  });
}
