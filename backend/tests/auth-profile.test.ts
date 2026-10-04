import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { authRoutes } from '../src/api/routes/auth';

vi.mock('../src/db', () => ({ query: async () => ({ rows: [{ id: 'account-id', totp_enabled: true }] }) }));
vi.mock('../src/auth/middleware', () => ({
  authenticateRequest: async (request: any) => {
    request.user = { userId: 'account-id', sessionId: 'session-id', username: 'admin', role: 'admin' };
  },
  recordAuditLog: vi.fn()
}));

describe('Authenticated profile contract', () => {
  it('keeps the account id used by the panel after a reload', async () => {
    const server = Fastify();
    try {
      await server.register(authRoutes, { prefix: '/api/auth' });
      const response = await server.inject('/api/auth/me');
      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ id: 'account-id', userId: 'account-id', totp_enabled: true });
    } finally { await server.close(); }
  });
});
