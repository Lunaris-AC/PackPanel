import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateRequest, requireRole } from '../../auth/middleware';
import {
  fetchMojangVersions,
  getAvailableLoadersForMinecraft,
  getLoaderVersions,
  resolveJavaRequirement,
  validateCombination,
  catalogCache,
  LoaderType
} from '../../catalog';

export async function catalogRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateRequest);

  // 1. Get Minecraft versions list
  fastify.get('/catalog/minecraft', async (req, reply) => {
    const { type = 'release', search = '' } = req.query as {
      type?: 'release' | 'snapshot' | 'all';
      search?: string;
    };

    try {
      const manifest = await fetchMojangVersions();
      let filtered = manifest.versions;

      if (type !== 'all') {
        filtered = filtered.filter(v => v.type === type);
      }

      if (search.trim() !== '') {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter(v => v.id.toLowerCase().includes(q));
      }

      return reply.send({
        versions: filtered,
        latestRelease: manifest.latestRelease,
        latestSnapshot: manifest.latestSnapshot
      });
    } catch (err: any) {
      return reply.status(502).send({
        error: 'Impossible de récupérer le catalogue officiel Minecraft: ' + (err.message || 'Erreur réseau')
      });
    }
  });

  // 2. Get available loaders for a given Minecraft version
  fastify.get('/catalog/loaders', async (req, reply) => {
    const q = req.query as any;
    const minecraftVersion = q.minecraftVersion || q.mcVersion;
    if (!minecraftVersion) {
      return reply.status(400).send({ error: 'Le paramètre minecraftVersion (ou mcVersion) est requis' });
    }

    try {
      const loaders = await getAvailableLoadersForMinecraft(minecraftVersion);
      return reply.send({ mcVersion: minecraftVersion, loaders });
    } catch (err: any) {
      return reply.status(502).send({
        error: 'Erreur lors de la résolution des loaders: ' + (err.message || '')
      });
    }
  });

  // 3. Get exact loader versions for a loader & Minecraft version
  fastify.get('/catalog/loader-versions', async (req, reply) => {
    const q = req.query as any;
    const loader = q.loader as LoaderType;
    const minecraftVersion = q.minecraftVersion || q.mcVersion;

    if (!['vanilla', 'fabric', 'quilt', 'neoforge', 'forge'].includes(loader) || !minecraftVersion) {
      return reply.status(400).send({ error: 'Les paramètres loader et minecraftVersion sont requis' });
    }

    try {
      const versions = await getLoaderVersions(loader, minecraftVersion);
      return reply.send({ loader, mcVersion: minecraftVersion, versions });
    } catch (err: any) {
      return reply.status(502).send({
        error: 'Erreur lors de la résolution des versions du loader: ' + (err.message || '')
      });
    }
  });

  // 4. Resolve Java requirements and default arguments
  fastify.get('/catalog/requirements', async (req, reply) => {
    const q = req.query as any;
    const minecraftVersion = q.minecraftVersion || q.mcVersion;
    const loader = (q.loader || 'vanilla') as LoaderType;
    const loaderVersion = q.loaderVersion;

    if (!minecraftVersion) {
      return reply.status(400).send({ error: 'Le paramètre minecraftVersion est requis' });
    }

    try {
      const requirements = await resolveJavaRequirement(minecraftVersion, loader, loaderVersion);
      return reply.send({ requirements });
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Erreur lors du calcul des exigences Java: ' + (err.message || '')
      });
    }
  });

  // 5. Validate complete combination
  fastify.post('/catalog/validate', async (req, reply) => {
    const schema = z.object({
      minecraftVersion: z.string().min(1),
      loader: z.enum(['vanilla', 'fabric', 'quilt', 'neoforge', 'forge']),
      loaderVersion: z.string().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { minecraftVersion, loader, loaderVersion } = parsed.data;
    try {
      const result = await validateCombination(minecraftVersion, loader, loaderVersion);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Erreur de validation: ' + (err.message || '')
      });
    }
  });

  // 6. Force refresh cache (admin/operator only)
  fastify.post('/catalog/refresh', {
    preHandler: [requireRole(['admin', 'operator'])]
  }, async (req, reply) => {
    catalogCache.clear();
    return reply.send({ success: true, message: 'Cache du catalogue de versions réinitialisé avec succès' });
  });
}
