"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const db_1 = require("../../db");
const argon2_1 = require("../../auth/argon2");
const tokens_1 = require("../../auth/tokens");
const middleware_1 = require("../../auth/middleware");
async function authRoutes(fastify) {
    // Login
    fastify.post('/login', async (req, reply) => {
        const bodySchema = zod_1.z.object({
            username: zod_1.z.string().min(1),
            password: zod_1.z.string().min(1),
        });
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Identifiants invalides' });
        }
        const { username, password } = parsed.data;
        const res = await (0, db_1.query)('SELECT id, username, password_hash, role FROM users WHERE username = $1', [username]);
        if (res.rows.length === 0) {
            return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
        }
        const user = res.rows[0];
        const valid = await (0, argon2_1.verifyPassword)(user.password_hash, password);
        if (!valid) {
            return reply.status(401).send({ error: 'Nom d’utilisateur ou mot de passe incorrect' });
        }
        const ip = req.ip;
        const ua = req.headers['user-agent'];
        const { sessionId, token } = await (0, tokens_1.createSession)(user.id, ip, ua);
        // Set HttpOnly, SameSite=Lax cookie
        reply.setCookie(tokens_1.SESSION_COOKIE_NAME, `${sessionId}:${token}`, {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60, // 7 days
        });
        await (0, middleware_1.recordAuditLog)(user.id, 'login', 'user', user.id, { username }, ip);
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
    fastify.post('/logout', { preHandler: [middleware_1.authenticateRequest] }, async (req, reply) => {
        if (req.user) {
            await (0, tokens_1.revokeSession)(req.user.sessionId);
            await (0, middleware_1.recordAuditLog)(req.user.userId, 'logout', 'user', req.user.userId, {}, req.ip);
        }
        reply.clearCookie(tokens_1.SESSION_COOKIE_NAME, { path: '/' });
        return reply.send({ success: true });
    });
    // Me (current authenticated user)
    fastify.get('/me', { preHandler: [middleware_1.authenticateRequest] }, async (req, reply) => {
        return reply.send({ user: req.user });
    });
    // Update password
    fastify.put('/password', { preHandler: [middleware_1.authenticateRequest] }, async (req, reply) => {
        const bodySchema = zod_1.z.object({
            currentPassword: zod_1.z.string().min(1),
            newPassword: zod_1.z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
        });
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.issues[0].message });
        }
        const { currentPassword, newPassword } = parsed.data;
        const userRes = await (0, db_1.query)('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
        const valid = await (0, argon2_1.verifyPassword)(userRes.rows[0].password_hash, currentPassword);
        if (!valid) {
            return reply.status(400).send({ error: 'Mot de passe actuel incorrect' });
        }
        const newHash = await (0, argon2_1.hashPassword)(newPassword);
        await (0, db_1.query)('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.userId]);
        await (0, middleware_1.recordAuditLog)(req.user.userId, 'password_change', 'user', req.user.userId, {}, req.ip);
        return reply.send({ success: true, message: 'Mot de passe mis à jour avec succès' });
    });
}
//# sourceMappingURL=auth.js.map