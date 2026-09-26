"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const config_1 = require("../config");
const sse_1 = require("./sse");
const auth_1 = require("./routes/auth");
const endpoints_1 = require("./routes/endpoints");
const uploads_1 = require("./routes/uploads");
const explorer_1 = require("./routes/explorer");
const versions_1 = require("./routes/versions");
const jobs_1 = require("./routes/jobs");
const stats_1 = require("./routes/stats");
const users_1 = require("./routes/users");
const server = (0, fastify_1.default)({
    logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    bodyLimit: 100 * 1024 * 1024, // 100MB JSON limit
});
async function main() {
    // 1. Core plugins
    await server.register(cors_1.default, {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Tus-Resumable', 'Upload-Length', 'Upload-Metadata', 'Upload-Offset', 'X-Requested-With'],
        exposedHeaders: ['Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension']
    });
    await server.register(cookie_1.default, {
        secret: config_1.config.SESSION_SECRET,
        parseOptions: {}
    });
    await server.register(multipart_1.default, {
        limits: {
            fileSize: 2 * 1024 * 1024 * 1024, // 2 GB per direct file/archive upload
            files: 100
        }
    });
    // 2. Healthcheck
    server.get('/api/health', async (req, reply) => {
        return reply.send({
            status: 'ok',
            version: '1.0.0',
            timestamp: new Date().toISOString()
        });
    });
    // 3. Server-Sent Events (SSE) stream for live updates
    server.get('/api/events', async (req, reply) => {
        return sse_1.sseManager.addClient(req, reply);
    });
    // 4. TUS Resumable Upload Handlers
    server.all('/api/uploads/tus', async (req, reply) => {
        reply.hijack();
        uploads_1.tusServer.handle(req.raw, reply.raw);
    });
    server.all('/api/uploads/tus/*', async (req, reply) => {
        reply.hijack();
        uploads_1.tusServer.handle(req.raw, reply.raw);
    });
    // 5. Register modular API routes
    await server.register(auth_1.authRoutes, { prefix: '/api/auth' });
    await server.register(endpoints_1.endpointRoutes, { prefix: '/api/endpoints' });
    await server.register(uploads_1.uploadRoutes, { prefix: '/api' });
    await server.register(explorer_1.explorerRoutes, { prefix: '/api' });
    await server.register(versions_1.versionRoutes, { prefix: '/api' });
    await server.register(jobs_1.jobRoutes, { prefix: '/api' });
    await server.register(stats_1.statsRoutes, { prefix: '/api' });
    await server.register(users_1.userRoutes, { prefix: '/api' });
    // Custom global error handler
    server.setErrorHandler((error, request, reply) => {
        if (error.name === 'InvalidPathError' || error.statusCode === 400) {
            return reply.status(400).send({ error: error.message });
        }
        server.log.error(error);
        const statusCode = error.statusCode || 500;
        return reply.status(statusCode).send({
            error: error.message || 'Erreur interne du serveur'
        });
    });
    // 6. Graceful shutdown
    const shutdown = async (signal) => {
        server.log.info(`Signal de terminaison ${signal} reçu, arrêt en cours...`);
        sse_1.sseManager.closeAll();
        await server.close();
        process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    try {
        const address = await server.listen({
            port: config_1.config.ADMIN_ORIGIN_PORT,
            host: '0.0.0.0'
        });
        server.log.info(`PackPanel API opérationnelle sur ${address}`);
    }
    catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}
main();
//# sourceMappingURL=server.js.map