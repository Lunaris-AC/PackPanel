import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { catalogApi } from '../src/api/catalog';
import { catalogRoutes } from '../../backend/src/api/routes/catalog';

vi.mock('../../backend/src/auth/middleware', () => ({ authenticateRequest: async () => {}, requireRole: () => async () => {} }));
vi.mock('../../backend/src/catalog', () => ({
  fetchMojangVersions: async () => ({ versions: [{ id: '1.21.1', type: 'release' }, { id: '24w14a', type: 'snapshot' }], latestRelease: '1.21.1', latestSnapshot: '24w14a' }),
  getAvailableLoadersForMinecraft: async () => [{ loader: 'fabric', available: true }, { loader: 'vanilla', available: true }],
  getLoaderVersions: async () => [{ version: '0.16.5', stable: true, isRecommended: true }],
  resolveJavaRequirement: async () => ({ majorVersion: 21, jvmArgs: ['-Xmx4G'] }),
  validateCombination: async (mc: string, loader: string) => ({ valid: mc === '1.21.1' && loader === 'fabric', resolvedLoaderVersion: '0.16.5', javaRequirement: { majorVersion: 21 } }),
  catalogCache: { clear: vi.fn() }
}));

describe('Frontend catalog requests against the real API routes', () => {
  let server: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    server = Fastify();
    await server.register(catalogRoutes, { prefix: '/api/v2' });
    vi.stubGlobal('fetch', async (url: string, options: RequestInit = {}) => {
      const response = await server.inject({ method: (options.method || 'GET') as any, url, headers: options.headers as any, payload: options.body as string | undefined });
      return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(async () => { await server.close(); vi.unstubAllGlobals(); });
  it('includes snapshots for the All filter', async () => { expect((await catalogApi.getMinecraftVersions()).versions).toHaveLength(2); });
  it('exposes usable loader compatibility', async () => { expect((await catalogApi.getCompatibleLoaders('1.21.1')).loaders.find(l => l.loader === 'fabric')?.available).toBe(true); });
  it('exposes Java requirements in the field consumed by the wizard', async () => { expect((await catalogApi.getRequirements('1.21.1', 'fabric')).requirements.majorVersion).toBe(21); });
  it('validates the exact body sent by creation and settings', async () => { expect((await catalogApi.validateCombination('1.21.1', 'fabric', '0.16.5')).valid).toBe(true); });
  it('rejects unknown loader names', async () => { expect((await server.inject('/api/v2/catalog/loader-versions?mcVersion=1.21.1&loader=invalid')).statusCode).toBe(400); });
});
