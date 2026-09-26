"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateRequest = authenticateRequest;
exports.requireRole = requireRole;
exports.recordAuditLog = recordAuditLog;
const tokens_1 = require("./tokens");
const db_1 = require("../db");
async function authenticateRequest(req, reply) {
    let sessionId;
    let token;
    // 1. Try cookie: packpanel_session = "sessionId:token"
    const cookie = req.cookies[tokens_1.SESSION_COOKIE_NAME];
    if (cookie && cookie.includes(':')) {
        const parts = cookie.split(':');
        sessionId = parts[0];
        token = parts[1];
    }
    // 2. Try Authorization: Bearer <sessionId>:<token>
    if (!sessionId) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const raw = authHeader.substring(7).trim();
            if (raw.includes(':')) {
                const parts = raw.split(':');
                sessionId = parts[0];
                token = parts[1];
            }
        }
    }
    if (!sessionId || !token) {
        return reply.status(401).send({ error: 'Authentification requise' });
    }
    const user = await (0, tokens_1.validateSession)(sessionId, token);
    if (!user) {
        return reply.status(401).send({ error: 'Session invalide ou expirée' });
    }
    req.user = user;
}
function requireRole(allowedRoles) {
    return async (req, reply) => {
        if (!req.user) {
            return reply.status(401).send({ error: 'Authentification requise' });
        }
        if (req.user.role === 'admin') {
            return; // Admin has full access
        }
        if (!allowedRoles.includes(req.user.role)) {
            return reply.status(403).send({ error: 'Droits insuffisants pour cette action' });
        }
    };
}
async function recordAuditLog(userId, action, resourceType, resourceId, details = {}, ipAddress) {
    await (0, db_1.query)(`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`, [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress || null]);
}
//# sourceMappingURL=middleware.js.map