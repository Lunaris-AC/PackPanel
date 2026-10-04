import { FastifyInstance } from 'fastify';
import { config, publicConfigSchema, savePublicConfiguration } from '../../config';
import { authenticateRequest, requireRole, recordAuditLog } from '../../auth/middleware';

export async function systemRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authenticateRequest);
  server.get('/public-config', async () => ({ adminFqdn: config.ADMIN_FQDN, filesFqdn: config.FILES_FQDN, filesBaseUrl: config.FILES_BASE_URL || undefined }));
  server.put('/public-config', { preHandler: requireRole(['admin']) }, async (req, reply) => {
    const parsed = publicConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Adresses publiques invalides' });
    savePublicConfiguration(parsed.data);
    await recordAuditLog(req.user!.userId, 'configure', 'system', 'public-config', parsed.data, req.ip);
    return { success: true };
  });
}
