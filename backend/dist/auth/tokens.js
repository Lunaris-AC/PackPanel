"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_COOKIE_NAME = void 0;
exports.hashToken = hashToken;
exports.createSession = createSession;
exports.validateSession = validateSession;
exports.revokeSession = revokeSession;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
exports.SESSION_COOKIE_NAME = 'packpanel_session';
function hashToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
async function createSession(userId, ipAddress, userAgent) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const sessionId = crypto_1.default.randomUUID();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await (0, db_1.query)(`INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`, [sessionId, userId, tokenHash, ipAddress || null, userAgent || null, expiresAt]);
    return { sessionId, token };
}
async function validateSession(sessionId, token) {
    const tokenHash = hashToken(token);
    const res = await (0, db_1.query)(`SELECT s.id as session_id, s.expires_at, u.id as user_id, u.username, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.token_hash = $2 AND s.expires_at > NOW()`, [sessionId, tokenHash]);
    if (res.rows.length === 0) {
        return null;
    }
    // Update last_active_at asynchronously
    (0, db_1.query)('UPDATE sessions SET last_active_at = NOW() WHERE id = $1', [sessionId]).catch(() => { });
    const row = res.rows[0];
    return {
        sessionId: row.session_id,
        userId: row.user_id,
        username: row.username,
        role: row.role,
    };
}
async function revokeSession(sessionId) {
    await (0, db_1.query)('DELETE FROM sessions WHERE id = $1', [sessionId]);
}
//# sourceMappingURL=tokens.js.map