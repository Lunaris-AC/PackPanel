import crypto from 'crypto';
import { query } from '../db';

export const SESSION_COOKIE_NAME = 'packpanel_session';

export interface UserSession {
  sessionId: string;
  userId: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ sessionId: string; token: string }> {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await query(
    `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sessionId, userId, tokenHash, ipAddress || null, userAgent || null, expiresAt]
  );

  return { sessionId, token };
}

export async function validateSession(sessionId: string, token: string): Promise<UserSession | null> {
  const tokenHash = hashToken(token);

  const res = await query(
    `SELECT s.id as session_id, s.expires_at, u.id as user_id, u.username, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.token_hash = $2 AND s.expires_at > NOW()`,
    [sessionId, tokenHash]
  );

  if (res.rows.length === 0) {
    return null;
  }

  // Update last_active_at asynchronously
  query('UPDATE sessions SET last_active_at = NOW() WHERE id = $1', [sessionId]).catch(() => {});

  const row = res.rows[0];
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    username: row.username,
    role: row.role as 'admin' | 'operator' | 'viewer',
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}
