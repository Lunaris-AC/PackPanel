import fs from 'fs';
import path from 'path';
import { InstanceManifestV2, InstanceFileEntryV2, InstanceManifestV2Schema } from '@packpanel/protocol';
import { resolveSafePath } from '../utils/platform.js';
import { fetchJson, downloadFile } from '../utils/http.js';
import { computeFileHashes } from '../utils/hasher.js';

export interface SyncProgressCallback {
  (current: number, total: number, currentFile: string): void;
}

type OptionalChoices = Record<string, boolean>;
const isOptional = (file: InstanceFileEntryV2) => ['optional', 'default_on', 'default_off'].includes(file.policy);
function protectedPathMatcher(manifest: InstanceManifestV2) {
  const normalize = (value: string) => value.replace(/\\+/g, '/').toLowerCase();
  const protectedPaths = [
    'saves/', 'screenshots/', 'options.txt', 'optionsof.txt', 'usercache.json', 'servers.dat',
    ...(manifest.protectedPaths || []),
    ...manifest.files.filter(file => file.policy === 'protected' || file.policy === 'user_managed').map(file => file.path)
  ].map(normalize);
  return (value: string) => {
    const normalized = normalize(value);
    return protectedPaths.some(entry => entry.endsWith('/')
      ? normalized.startsWith(entry) || normalized === entry.slice(0, -1)
      : normalized === entry);
  };
}

export class InstanceSynchronizer {
  private instanceDir: string;

  constructor(instanceDir: string) {
    this.instanceDir = instanceDir;
  }

  listOptionalFiles(manifest: InstanceManifestV2, choices: OptionalChoices = {}) {
    const isProtected = protectedPathMatcher(manifest);
    return manifest.files.filter(file => isOptional(file) && !isProtected(file.path)).map(file => ({
      path: file.path,
      enabled: Object.hasOwn(choices, file.path) ? choices[file.path] :
        file.policy === 'default_on' || fs.existsSync(resolveSafePath(this.instanceDir, file.path))
    }));
  }

  /**
   * Fetches manifest from either V2 packpanel.json or legacy MineLaunched index.php
   */
  static async fetchManifest(manifestUrl: string, signal?: AbortSignal): Promise<InstanceManifestV2> {
    const rawData = await fetchJson<any>(manifestUrl, signal);

    // If it's already a V2 manifest
    if (rawData && rawData.formatVersion === 2) {
      return InstanceManifestV2Schema.parse(rawData);
    }

    // If it's a MineLaunched manifest (JSON array)
    if (Array.isArray(rawData)) {
      const files: InstanceFileEntryV2[] = [];
      const cleanupRules: string[] = [];

      for (const entry of rawData) {
        if ('dirCheckUselessFiles' in entry) {
          cleanupRules.push(entry.dirCheckUselessFiles);
        } else if (entry.checksumSHA1 && typeof entry.checksumSHA1 === 'string') {
          files.push({
            path: entry.path,
            sha1: entry.checksumSHA1,
            size: 0,
            url: entry.url,
            policy: 'required'
          });
        }
      }

      return {
        formatVersion: 2,
        instanceId: '00000000-0000-0000-0000-000000000000',
        instanceName: 'MineLaunched Legacy Pack',
        slug: 'legacy-pack',
        minecraftVersion: '1.20.1', // Default fallback
        loader: { type: 'fabric' },
        java: { majorVersion: 17 },
        protectedPaths: ['saves/', 'screenshots/', 'options.txt', 'optionsof.txt', 'usercache.json', 'servers.dat'],
        cleanupRules: cleanupRules.length > 0 ? cleanupRules : ['mods'],
        files,
        updatedAt: new Date().toISOString()
      };
    }

    throw new Error('Format de manifeste non reconnu (ni PackPanel V2 ni MineLaunched).');
  }

  /**
   * Synchronizes instance files: downloads missing/updated files and cleans obsolete files
   */
  async sync(
    manifest: InstanceManifestV2,
    onProgress?: SyncProgressCallback,
    concurrency: number = 4,
    options: { signal?: AbortSignal; optionalFiles?: OptionalChoices } = {}
  ): Promise<void> {
    const { signal, optionalFiles = {} } = options;
    signal?.throwIfAborted();
    if (!fs.existsSync(this.instanceDir)) {
      fs.mkdirSync(this.instanceDir, { recursive: true });
    }

    for (const file of manifest.files) resolveSafePath(this.instanceDir, file.path);
    for (const rule of manifest.cleanupRules || []) resolveSafePath(this.instanceDir, rule);
    const isProtected = protectedPathMatcher(manifest);

    // 1. Determine which files need downloading
    const filesToDownload: InstanceFileEntryV2[] = [];
    const optionalToRemove: string[] = [];
    const validManifestPaths = new Set<string>();
    const comparisonPath = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;

    for (const file of manifest.files) {
      signal?.throwIfAborted();
      const normalizedPath = file.path.replace(/\\+/g, '/');
      validManifestPaths.add(comparisonPath(normalizedPath));

      if (isProtected(normalizedPath)) {
        continue; // Never overwrite player-protected files
      }

      const localPath = resolveSafePath(this.instanceDir, normalizedPath);
      if (isOptional(file)) {
        if (Object.hasOwn(optionalFiles, file.path)) {
          if (!optionalFiles[file.path]) {
            optionalToRemove.push(normalizedPath);
            continue;
          }
        } else if (file.policy !== 'default_on' && !fs.existsSync(localPath)) {
          continue;
        }
      }
      if (!fs.existsSync(localPath)) {
        filesToDownload.push(file);
      } else {
        try {
          const hashes = await computeFileHashes(localPath);
          if (hashes.sha1 !== file.sha1.toLowerCase() || (file.sha256 && hashes.sha256 !== file.sha256.toLowerCase())) {
            filesToDownload.push(file);
          }
        } catch (e) {
          filesToDownload.push(file);
        }
      }
    }

    // 2. Download missing or modified files with concurrency limiter
    const totalFiles = filesToDownload.length;
    let completedCount = 0;

    const queue = [...filesToDownload];
    const controller = new AbortController();
    const downloadSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const workerCount = Math.min(Math.max(1, Math.trunc(concurrency) || 1), totalFiles);
    const workers = Array.from({ length: workerCount }, async () => {
      try {
        while (queue.length && !downloadSignal.aborted) {
          const item = queue.shift()!;
          const destPath = resolveSafePath(this.instanceDir, item.path);
          await downloadFile(item.url, destPath, {
            expectedSha1: item.sha1,
            expectedSha256: item.sha256,
            expectedSize: item.size > 0 ? item.size : undefined,
            signal: downloadSignal
          });
          onProgress?.(++completedCount, totalFiles, item.path);
        }
      } catch (error) {
        controller.abort(error);
      }
    });

    await Promise.all(workers);
    downloadSignal.throwIfAborted();
    for (const relativePath of optionalToRemove) {
      await fs.promises.rm(resolveSafePath(this.instanceDir, relativePath), { force: true });
    }

    // 3. Cleanup useless files according to cleanupRules
    for (const rule of manifest.cleanupRules || []) {
      if (isProtected(rule)) continue;
      const ruleDir = resolveSafePath(this.instanceDir, rule);
      if (fs.existsSync(ruleDir) && fs.statSync(ruleDir).isDirectory()) {
        this.cleanDirectory(ruleDir, candidate => validManifestPaths.has(comparisonPath(candidate)), isProtected);
      }
    }
  }

  private cleanDirectory(
    dirPath: string,
    isInManifest: (p: string) => boolean,
    isProtected: (p: string) => boolean
  ) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(this.instanceDir, fullPath).replace(/\\+/g, '/');

      if (isProtected(relPath)) {
        continue;
      }
      resolveSafePath(this.instanceDir, relPath);

      if (entry.isDirectory()) {
        this.cleanDirectory(fullPath, isInManifest, isProtected);
        // If directory is now empty, remove it
        if (fs.readdirSync(fullPath).length === 0) {
          try { fs.rmdirSync(fullPath); } catch (e) {}
        }
      } else {
        if (!isInManifest(relPath)) {
          try {
            fs.unlinkSync(fullPath);
          } catch (e) {
            // Ignore file lock during cleanup
          }
        }
      }
    }
  }
}
