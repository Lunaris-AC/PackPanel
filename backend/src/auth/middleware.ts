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

import { config } from '../config';

export function isAllowedOrigin(originHeader?: string): boolean {
  if (!originHeader) return true;
  try {
    const parsed = new URL(originHeader);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === config.ADMIN_FQDN.toLowerCase() ||
      host === config.FILES_FQDN.toLowerCase() ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/.test(host)
    );
  } catch (e) {
    return false;
  }
}

export async function enforceOriginCheck(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return;
  }
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  if (origin && !isAllowedOrigin(origin)) {
    return reply.status(403).send({ error: 'Origine interdite (protection CSRF)' });
  }
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

export function requireEndpointPermission(permission: 'can_write' | 'can_publish') {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.status(401).send({ error: 'Authentification requise' });
    }
    if (req.user.role === 'admin') {
      return;
    }
    const endpointId = (req.params as any)?.id || (req.params as any)?.endpointId || (req.body as any)?.endpointId || (req.query as any)?.endpointId;
    if (!endpointId) return;

    const res = await query(
      `SELECT can_write, can_publish FROM user_endpoint_permissions WHERE user_id = $1 AND endpoint_id = $2`,
      [req.user.userId, endpointId]
    );
    if (res.rows.length === 0 || !res.rows[0][permission]) {
      return reply.status(403).send({ error: `Droits insuffisants (${permission}) sur cet endpoint` });
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
