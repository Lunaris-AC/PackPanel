import { z } from 'zod';

export type LoaderType = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt';
export const LoaderTypeSchema = z.enum(['vanilla', 'forge', 'neoforge', 'fabric', 'quilt']);

export type FilePolicyType = 'required' | 'optional' | 'default_on' | 'default_off' | 'user_managed' | 'protected';
export const FilePolicyTypeSchema = z.enum(['required', 'optional', 'default_on', 'default_off', 'user_managed', 'protected']);

export type LauncherTemplate = 'minimal' | 'community' | 'network';
export const LauncherTemplateSchema = z.enum(['minimal', 'community', 'network']);

export interface InstanceFileEntryV2 {
  path: string;
  sha1: string;
  sha256?: string;
  size: number;
  url: string;
  policy: FilePolicyType;
}

export const InstanceFileEntryV2Schema = z.object({
  path: z.string().min(1),
  sha1: z.string().length(40),
  sha256: z.string().length(64).optional(),
  size: z.number().int().nonnegative(),
  url: z.string().url(),
  policy: FilePolicyTypeSchema.default('required')
});

export interface InstanceManifestV2 {
  formatVersion: 2;
  instanceId: string;
  instanceName: string;
  slug: string;
  minecraftVersion: string;
  loader: {
    type: LoaderType;
    version?: string;
  };
  java: {
    majorVersion: number;
    recommendedMemoryMb?: number;
    jvmArgs?: string[];
  };
  server?: {
    address: string;
    port?: number;
    name?: string;
  };
  protectedPaths: string[];
  cleanupRules: string[];
  files: InstanceFileEntryV2[];
  updatedAt: string;
}

export const InstanceManifestV2Schema = z.object({
  formatVersion: z.literal(2),
  instanceId: z.string().uuid(),
  instanceName: z.string().min(1).max(128),
  slug: z.string().min(1).max(64),
  minecraftVersion: z.string().min(1),
  loader: z.object({
    type: LoaderTypeSchema,
    version: z.string().optional()
  }),
  java: z.object({
    majorVersion: z.number().int().positive().default(17),
    recommendedMemoryMb: z.number().int().positive().optional(),
    jvmArgs: z.array(z.string()).optional()
  }),
  server: z.object({
    address: z.string(),
    port: z.number().int().positive().optional(),
    name: z.string().optional()
  }).optional(),
  protectedPaths: z.array(z.string()).default([
    'saves/',
    'screenshots/',
    'options.txt',
    'optionsof.txt',
    'usercache.json',
    'servers.dat'
  ]),
  cleanupRules: z.array(z.string()).default(['mods']),
  files: z.array(InstanceFileEntryV2Schema),
  updatedAt: z.string()
});

export interface LauncherBranding {
  title: string;
  accentColor: string;
  backgroundUrl?: string;
  logoUrl?: string;
  iconUrl?: string;
  discordUrl?: string;
  websiteUrl?: string;
}

export const LauncherBrandingSchema = z.object({
  title: z.string().min(1).max(128),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  backgroundUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  discordUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional()
});

export interface LauncherConfigV2 {
  formatVersion: 2;
  launcherId: string;
  name: string;
  slug: string;
  template: LauncherTemplate;
  branding: LauncherBranding;
  auth: {
    microsoft: boolean;
    offline: boolean;
  };
  instances: Array<{
    id: string;
    slug: string;
    name: string;
    manifestUrl: string;
    isDefault: boolean;
    iconUrl?: string;
  }>;
}

export const LauncherConfigV2Schema = z.object({
  formatVersion: z.literal(2),
  launcherId: z.string().uuid(),
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64),
  template: LauncherTemplateSchema,
  branding: LauncherBrandingSchema,
  auth: z.object({
    microsoft: z.boolean(),
    offline: z.boolean()
  }),
  instances: z.array(z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    manifestUrl: z.string().url(),
    isDefault: z.boolean(),
    iconUrl: z.string().url().optional()
  }))
});

export type EngineStatusStep =
  | 'idle'
  | 'checking_java'
  | 'downloading_java'
  | 'resolving_version'
  | 'syncing_files'
  | 'downloading_assets'
  | 'extracting_natives'
  | 'launching'
  | 'running'
  | 'crashed'
  | 'stopped';

export interface EngineProgressEvent {
  step: EngineStatusStep;
  progress: number; // 0 to 100
  totalBytes?: number;
  transferredBytes?: number;
  currentFile?: string;
  message: string;
}

export interface AuthProfile {
  id: string; // UUID without hyphens or standard UUID
  name: string; // Player display name
  userType: 'microsoft' | 'offline';
  accessToken: string;
}
