import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession, SESSION_COOKIE_NAME, UserSession } from './tokens';
import { query } from '../db';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSession;
  }
}

export async function authenticateRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  let sessionId: string | undefined;
  let token: string | undefined;

  // 1. Try cookie: packpanel_session = "sessionId:token"
  const cookie = req.cookies[SESSION_COOKIE_NAME];
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

  const user = await validateSession(sessionId, token);
  if (!user) {
    return reply.status(401).send({ error: 'Session invalide ou expirée' });
  }

  req.user = user;
}

export function requireRole(allowedRoles: Array<'admin' | 'operator' | 'viewer'>) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
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

export async function recordAuditLog(
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  details: any = {},
  ipAddress?: string
): Promise<void> {
  await query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress || null]
  );
}
