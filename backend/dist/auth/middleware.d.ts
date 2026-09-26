import { FastifyRequest, FastifyReply } from 'fastify';
import { UserSession } from './tokens';
declare module 'fastify' {
    interface FastifyRequest {
        user?: UserSession;
    }
}
export declare function authenticateRequest(req: FastifyRequest, reply: FastifyReply): Promise<void>;
export declare function requireRole(allowedRoles: Array<'admin' | 'operator' | 'viewer'>): (req: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
export declare function recordAuditLog(userId: string | null, action: string, resourceType: string, resourceId: string, details?: any, ipAddress?: string): Promise<void>;
