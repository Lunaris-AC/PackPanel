import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { config } from '../config';
import { sseManager } from './sse';
import { authRoutes } from './routes/auth';
import { endpointRoutes } from './routes/endpoints';
import { uploadRoutes, tusServer } from './routes/uploads';
import { explorerRoutes } from './routes/explorer';
import { versionRoutes } from './routes/versions';
import { jobRoutes } from './routes/jobs';
import { statsRoutes } from './routes/stats';
import { userRoutes } from './routes/users';

import { authenticateRequest, enforceOriginCheck, isAllowedOrigin } from '../auth/middleware';

const server = Fastify({
  trustProxy: true,
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  bodyLimit: 100 * 1024 * 1024, // 100MB JSON limit
});

async function main() {
  // 1. Core plugins
  await server.register(cors, {
    origin: (origin, cb) => {
      if (!origin || isAllowedOrigin(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Origine non autorisée par la politique CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Tus-Resumable', 'Upload-Length', 'Upload-Metadata', 'Upload-Offset', 'X-Requested-With'],
    exposedHeaders: ['Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension']
  });

  await server.register(cookie, {
    secret: config.SESSION_SECRET,
    parseOptions: {}
  });

  await server.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024, // 2 GB per direct file/archive upload
      files: 100
    }
  });

  // Global CSRF / Origin enforcement on state-modifying requests
  server.addHook('preHandler', enforceOriginCheck);

  // 2. Healthcheck
  server.get('/api/health', async (req, reply) => {
    return reply.send({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // 3. Server-Sent Events (SSE) stream for live updates (authenticated)
  server.get('/api/events', {
    preHandler: [authenticateRequest]
  }, async (req, reply) => {
    return sseManager.addClient(req, reply);
  });

  // 4. TUS Resumable Upload Handlers (authenticated)
  const handleTus = async (req: any, reply: any) => {
    reply.hijack();
    tusServer.handle(req.raw, reply.raw);
  };

  server.all('/api/uploads/tus', { preHandler: [authenticateRequest] }, handleTus);
  server.all('/api/uploads/tus/*', { preHandler: [authenticateRequest] }, handleTus);

  // 5. Register modular API routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(endpointRoutes, { prefix: '/api/endpoints' });
  await server.register(uploadRoutes, { prefix: '/api' });
  await server.register(explorerRoutes, { prefix: '/api' });
  await server.register(versionRoutes, { prefix: '/api' });
  await server.register(jobRoutes, { prefix: '/api' });
  await server.register(statsRoutes, { prefix: '/api' });
  await server.register(userRoutes, { prefix: '/api' });

  // Custom global error handler
  server.setErrorHandler((error, request, reply) => {
    if (error.name === 'InvalidPathError' || (error as any).statusCode === 400) {
      return reply.status(400).send({ error: error.message });
    }
    server.log.error(error);
    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: error.message || 'Erreur interne du serveur'
    });
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    server.log.info(`Signal de terminaison ${signal} reçu, arrêt en cours...`);
    sseManager.closeAll();
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    const address = await server.listen({
      port: config.ADMIN_ORIGIN_PORT,
      host: '0.0.0.0'
    });
    server.log.info(`PackPanel API opérationnelle sur ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
