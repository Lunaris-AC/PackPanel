import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../../db';
import { verifyPassword, hashPassword } from '../../auth/argon2';
import { createSession, revokeSession, SESSION_COOKIE_NAME } from '../../auth/tokens';
import { authenticateRequest, recordAuditLog } from '../../auth/middleware';
import { generateTotpSecret, generateRecoveryCodes, getOtpAuthUri, verifyTOTP } from '../../auth/totp';

interface LoginRateLimit {
  attempts: number;
  blockedUntil: number;
}
const loginRateLimitMap = new Map<string, LoginRateLimit>();

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/login', async (req, reply) => {
    const ip = req.ip;
    const now = Date.now();
    const rate = loginRateLimitMap.get(ip);
    if (rate && rate.blockedUntil > now) {
      const waitSec = Math.ceil((rate.blockedUntil - now) / 1000);
      reply.header('Retry-After', waitSec);
      return reply.status(429).send({
        error: `Trop de tentatives de connexion infructueuses. Veuillez réessayer dans ${waitSec} secondes.`
      });
    }

    const bodySchema = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      totpCode: z.string().optional()
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Identifiants invalides' });
    }

    const { username, password, totpCode } = parsed.data;

    const res = await query('SELECT id, username, password_hash, role, totp_secret, totp_enabled, totp_recovery_codes FROM users WHERE username = $1', [username]);
    if (res.rows.length === 0) {
      const current = loginRateLimitMap.get(ip) || { attempts: 0, blockedUntil: 0 };
      current.attempts += 1;
      if (current.attempts >= 5) current.blockedUntil = now + 5 * 60 * 1000;
      loginRateLimitMap.set(ip, current);
      return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
    }

    const user = res.rows[0];
    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      const current = loginRateLimitMap.get(ip) || { attempts: 0, blockedUntil: 0 };
      current.attempts += 1;
      if (current.attempts >= 5) current.blockedUntil = now + 5 * 60 * 1000;
      loginRateLimitMap.set(ip, current);
      return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
    }

    // Two-Factor Authentication check if enabled
    if (user.totp_enabled) {
      if (!totpCode || totpCode.trim() === '') {
        return reply.send({
          require2FA: true,
          message: 'Code d’authentification à deux facteurs (2FA) requis'
        });
      }

      const validTotp = verifyTOTP(totpCode, user.totp_secret);
      let isRecoveryCode = false;

      if (!validTotp && user.totp_recovery_codes && Array.isArray(user.totp_recovery_codes)) {
        const cleanInput = totpCode.trim().toUpperCase();
        if (user.totp_recovery_codes.includes(cleanInput)) {
          isRecoveryCode = true;
          const remaining = user.totp_recovery_codes.filter((c: string) => c !== cleanInput);
          await query('UPDATE users SET totp_recovery_codes = $1 WHERE id = $2', [remaining, user.id]);
        }
      }

      if (!validTotp && !isRecoveryCode) {
        return reply.status(401).send({ error: 'Code 2FA invalide ou expiré' });
      }
    }

    // Login success: reset rate limit counter
    loginRateLimitMap.delete(ip);

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
    await recordAuditLog(user.id, 'login', 'user', user.id, { username, twoFactorUsed: user.totp_enabled }, ip);

    return reply.send({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        totp_enabled: user.totp_enabled
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
    const userRes = await query('SELECT id, username, role, totp_enabled FROM users WHERE id = $1', [req.user!.userId]);
    if (userRes.rows.length === 0) {
      return reply.status(404).send({ error: 'Utilisateur introuvable' });
    }
    const u = userRes.rows[0];
    return reply.send({
      user: {
        ...req.user,
        totp_enabled: u.totp_enabled
      }
    });
  });

  // 2FA: Initiate Setup
  fastify.post('/2fa/setup', { preHandler: [authenticateRequest] }, async (req, reply) => {
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes(8);
    const otpauthUri = getOtpAuthUri(req.user!.username, secret);

    await query(
      `UPDATE users
       SET totp_secret = $1, totp_recovery_codes = $2
       WHERE id = $3`,
      [secret, recoveryCodes, req.user!.userId]
    );

    return reply.send({
      secret,
      otpauthUri,
      recoveryCodes
    });
  });

  // 2FA: Confirm & Enable
  fastify.post('/2fa/enable', { preHandler: [authenticateRequest] }, async (req, reply) => {
    const schema = z.object({
      code: z.string().min(6).max(8)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Code 2FA invalide' });
    }

    const userRes = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user!.userId]);
    const secret = userRes.rows[0]?.totp_secret;
    if (!secret) {
      return reply.status(400).send({ error: 'Configuration 2FA non initialisée' });
    }

    const valid = verifyTOTP(parsed.data.code, secret);
    if (!valid) {
      return reply.status(400).send({ error: 'Code d’authentification incorrect ou expiré' });
    }

    await query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.user!.userId]);
    await recordAuditLog(req.user!.userId, 'enable_2fa', 'user', req.user!.userId, {}, req.ip);

    return reply.send({ success: true, message: 'Authentification à 2 facteurs (2FA) activée avec succès !' });
  });

  // 2FA: Disable
  fastify.post('/2fa/disable', { preHandler: [authenticateRequest] }, async (req, reply) => {
    const schema = z.object({
      password: z.string().min(1)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Mot de passe requis' });
    }

    const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.user!.userId]);
    const valid = await verifyPassword(userRes.rows[0].password_hash, parsed.data.password);
    if (!valid) {
      return reply.status(400).send({ error: 'Mot de passe incorrect' });
    }

    await query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_recovery_codes = \'{}\' WHERE id = $1', [req.user!.userId]);
    await recordAuditLog(req.user!.userId, 'disable_2fa', 'user', req.user!.userId, {}, req.ip);

    return reply.send({ success: true, message: 'Double authentification (2FA) désactivée' });
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

  // Change password without requiring current password (for Setup Wizard / authenticated onboarding)
  fastify.post('/change-password', { preHandler: [authenticateRequest] }, async (req, reply) => {
    const bodySchema = z.object({
      newPassword: z.string().min(10, 'Le mot de passe doit contenir au moins 10 caractères'),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { newPassword } = parsed.data;
    if (!(/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) && /[0-9]/.test(newPassword))) {
      return reply.status(400).send({
        error: 'Le mot de passe doit comporter au moins 1 majuscule, 1 minuscule et 1 chiffre.'
      });
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user!.userId]);
    // Revoke previous sessions on other devices
    await query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [req.user!.userId, req.user!.sessionId]);
    await recordAuditLog(req.user!.userId, 'password_change', 'user', req.user!.userId, { source: 'setup_wizard' }, req.ip);

    return reply.send({ success: true, message: 'Mot de passe mis à jour avec succès' });
  });
}

