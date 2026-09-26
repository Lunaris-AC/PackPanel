import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://packpanel:packpanel_secret@postgres:5432/packpanel'),
  
  // Public domains and ports
  ADMIN_FQDN: z.string().default('panel.mccdn.internal'),
  FILES_FQDN: z.string().default('mccdn.internal'),
  ADMIN_ORIGIN_PORT: z.coerce.number().default(8080),
  FILES_ORIGIN_PORT: z.coerce.number().default(8081),
  ZORAXY_SOURCE_IP: z.string().default('192.168.1.173'),

  // Storage paths
  APP_DIR: z.string().default('/opt/packpanel'),
  DATA_DIR: z.string().default('/srv/packpanel'),
  
  // Security & Auth
  SESSION_SECRET: z.string().min(16).default('packpanel_super_secret_session_key_32chars!'),
  ADMIN_LOGIN: z.string().default('admin'),
  ADMIN_DEFAULT_PASSWORD: z.string().default(''), // Loaded on first init if set
  
  // Uploads
  TUS_CHUNK_SIZE_MIB: z.coerce.number().default(8),
  MAX_UPLOAD_SESSION_EXPIRY_HOURS: z.coerce.number().default(24),
  MAX_ZIP_EXTRACT_SIZE_MIB: z.coerce.number().default(4096),
  MAX_ZIP_ENTRY_COUNT: z.coerce.number().default(20000),

  // Retention
  DEFAULT_RETENTION_DAYS: z.coerce.number().default(14),
  MIN_RETAINED_VERSIONS: z.coerce.number().default(5)
});

export const config = envSchema.parse(process.env);

// Computed absolute directory paths
export const DATA_DIR = config.DATA_DIR;
export const STORAGE_DIR = path.join(config.DATA_DIR, 'storage');
export const OBJECTS_DIR = path.join(STORAGE_DIR, 'objects');
export const UPLOADS_DIR = path.join(STORAGE_DIR, 'uploads');
export const STAGING_DIR = UPLOADS_DIR;
export const ENDPOINTS_DIR = path.join(STORAGE_DIR, 'endpoints');
export const BACKUPS_DIR = path.join(config.DATA_DIR, 'backups');

