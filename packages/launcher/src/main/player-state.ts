import { InstanceManifestV2 } from '@packpanel/protocol';
import { z } from 'zod';

export const packSummarySchema = z.object({
  releaseId: z.string().optional(),
  updatedAt: z.string(),
  minecraftVersion: z.string(),
  loader: z.string(),
  notes: z.string().optional(),
  serverAddress: z.string().optional()
});

export type PackSummary = z.infer<typeof packSummarySchema>;
export interface PackStatus {
  installed: PackSummary | null;
  latest: PackSummary | null;
  optionalFiles: Array<{ path: string; enabled: boolean }>;
}

export function summarizePack(manifest: InstanceManifestV2): PackSummary {
  const server = manifest.server;
  return {
    releaseId: manifest.releaseId,
    updatedAt: manifest.updatedAt,
    minecraftVersion: manifest.minecraftVersion,
    loader: manifest.loader.type,
    notes: manifest.releaseNotes,
    serverAddress: server && (server.port ? `${server.address}:${server.port}` : server.address)
  };
}

export function redactDiagnostics(log: string, home: string) {
  const sanitized = log
    .replace(/((?:--accessToken|access_token|refresh_token|authorization)["'\s:=,]+(?:Bearer\s+)?)[^\s,"'\]]+/gi, '$1[redacted]')
    .replace(/\bBearer\s+[^\s,"'\]]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted token]');
  return home ? sanitized.split(home).join('~').split(home.replace(/\\/g, '/')).join('~') : sanitized;
}
