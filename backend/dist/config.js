"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKUPS_DIR = exports.ENDPOINTS_DIR = exports.STAGING_DIR = exports.UPLOADS_DIR = exports.OBJECTS_DIR = exports.STORAGE_DIR = exports.DATA_DIR = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('production'),
    PORT: zod_1.z.coerce.number().default(3000),
    HOST: zod_1.z.string().default('0.0.0.0'),
    DATABASE_URL: zod_1.z.string().default('postgres://packpanel:packpanel_secret@postgres:5432/packpanel'),
    // Public domains and ports
    ADMIN_FQDN: zod_1.z.string().default('panel.mccdn.internal'),
    FILES_FQDN: zod_1.z.string().default('mccdn.internal'),
    ADMIN_ORIGIN_PORT: zod_1.z.coerce.number().default(8080),
    FILES_ORIGIN_PORT: zod_1.z.coerce.number().default(8081),
    ZORAXY_SOURCE_IP: zod_1.z.string().default('192.168.1.173'),
    // Storage paths
    APP_DIR: zod_1.z.string().default('/opt/packpanel'),
    DATA_DIR: zod_1.z.string().default('/srv/packpanel'),
    // Security & Auth
    SESSION_SECRET: zod_1.z.string().min(16).default('packpanel_super_secret_session_key_32chars!'),
    ADMIN_LOGIN: zod_1.z.string().default('admin'),
    ADMIN_DEFAULT_PASSWORD: zod_1.z.string().default(''), // Loaded on first init if set
    // Uploads
    TUS_CHUNK_SIZE_MIB: zod_1.z.coerce.number().default(8),
    MAX_UPLOAD_SESSION_EXPIRY_HOURS: zod_1.z.coerce.number().default(24),
    MAX_ZIP_EXTRACT_SIZE_MIB: zod_1.z.coerce.number().default(4096),
    MAX_ZIP_ENTRY_COUNT: zod_1.z.coerce.number().default(20000),
    // Retention
    DEFAULT_RETENTION_DAYS: zod_1.z.coerce.number().default(14),
    MIN_RETAINED_VERSIONS: zod_1.z.coerce.number().default(5)
});
exports.config = envSchema.parse(process.env);
// Computed absolute directory paths
exports.DATA_DIR = exports.config.DATA_DIR;
exports.STORAGE_DIR = path_1.default.join(exports.config.DATA_DIR, 'storage');
exports.OBJECTS_DIR = path_1.default.join(exports.STORAGE_DIR, 'objects');
exports.UPLOADS_DIR = path_1.default.join(exports.STORAGE_DIR, 'uploads');
exports.STAGING_DIR = exports.UPLOADS_DIR;
exports.ENDPOINTS_DIR = path_1.default.join(exports.STORAGE_DIR, 'endpoints');
exports.BACKUPS_DIR = path_1.default.join(exports.config.DATA_DIR, 'backups');
//# sourceMappingURL=config.js.map