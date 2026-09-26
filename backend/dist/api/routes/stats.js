"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsRoutes = statsRoutes;
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../../db");
const middleware_1 = require("../../auth/middleware");
const config_1 = require("../../config");
async function statsRoutes(fastify) {
    fastify.addHook('preHandler', middleware_1.authenticateRequest);
    fastify.get('/stats/dashboard', async (req, reply) => {
        // 1. Endpoints stats
        const endpointsCountRes = await (0, db_1.query)('SELECT COUNT(*) FROM endpoints');
        const totalEndpoints = parseInt(endpointsCountRes.rows[0].count, 10);
        // 2. Active releases count
        const activeReleasesRes = await (0, db_1.query)('SELECT COUNT(*) FROM releases WHERE is_active = TRUE');
        const activeReleases = parseInt(activeReleasesRes.rows[0].count, 10);
        // 3. Physical storage (unique CAS objects)
        const physicalRes = await (0, db_1.query)('SELECT COUNT(*) as count, COALESCE(SUM(size_bytes), 0) as total_bytes FROM objects');
        const physicalObjects = parseInt(physicalRes.rows[0].count, 10);
        const physicalBytes = Number(physicalRes.rows[0].total_bytes);
        // 4. Logical storage (active releases total bytes)
        const logicalRes = await (0, db_1.query)('SELECT COALESCE(SUM(total_bytes), 0) as total_bytes FROM releases WHERE is_active = TRUE');
        const logicalBytes = Number(logicalRes.rows[0].total_bytes);
        // Calculate deduplication savings
        const savedBytes = Math.max(0, logicalBytes - physicalBytes);
        const deduplicationRatio = physicalBytes > 0 ? (logicalBytes / physicalBytes).toFixed(2) : '1.00';
        // 5. Jobs stats
        const activeJobsRes = await (0, db_1.query)(`SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'running')`);
        const activeJobs = parseInt(activeJobsRes.rows[0].count, 10);
        const failedJobsRes = await (0, db_1.query)(`SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'`);
        const failedJobs24h = parseInt(failedJobsRes.rows[0].count, 10);
        // 6. Free disk space on DATA_DIR
        let diskTotal = 0;
        let diskFree = 0;
        try {
            if (typeof fs_1.default.statfsSync === 'function') {
                const stat = fs_1.default.statfsSync(config_1.DATA_DIR);
                diskTotal = Number(stat.blocks) * Number(stat.bsize);
                diskFree = Number(stat.bfree) * Number(stat.bsize);
            }
        }
        catch (e) {
            // fallback if filesystem statfs not available
        }
        // 7. Recent endpoints summary
        const recentEndpointsRes = await (0, db_1.query)(`
      SELECT e.id, e.slug, e.name, e.updated_at,
        r.release_id as active_release_id,
        r.version_num as active_version_num,
        r.total_files as active_total_files,
        r.total_bytes as active_total_bytes
      FROM endpoints e
      LEFT JOIN releases r ON r.endpoint_id = e.id AND r.is_active = TRUE
      ORDER BY e.updated_at DESC
      LIMIT 10
    `);
        // 8. Recent jobs
        const recentJobsRes = await (0, db_1.query)(`
      SELECT id, job_type, status, priority, created_at, error_message
      FROM jobs
      ORDER BY created_at DESC
      LIMIT 6
    `);
        return reply.send({
            summary: {
                totalEndpoints,
                activeReleases,
                physicalObjects,
                physicalBytes,
                logicalBytes,
                savedBytes,
                deduplicationRatio,
                activeJobs,
                failedJobs24h,
                diskTotal,
                diskFree
            },
            endpoints: recentEndpointsRes.rows.map(r => ({
                ...r,
                active_total_bytes: Number(r.active_total_bytes || 0)
            })),
            recentJobs: recentJobsRes.rows
        });
    });
}
//# sourceMappingURL=stats.js.map