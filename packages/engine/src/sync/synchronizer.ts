import fs from 'fs';
import path from 'path';
import { InstanceManifestV2, InstanceFileEntryV2, InstanceManifestV2Schema } from '@packpanel/protocol';
import { resolveSafePath } from '../utils/platform.js';
import { fetchJson, downloadFile } from '../utils/http.js';
import { computeFileHashes } from '../utils/hasher.js';

export interface SyncProgressCallback {
  (current: number, total: number, currentFile: string): void;
}

export class InstanceSynchronizer {
  private instanceDir: string;

  constructor(instanceDir: string) {
    this.instanceDir = instanceDir;
  }

  /**
   * Fetches manifest from either V2 packpanel.json or legacy MineLaunched index.php
   */
  static async fetchManifest(manifestUrl: string): Promise<InstanceManifestV2> {
    const rawData = await fetchJson<any>(manifestUrl);

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
    concurrency: number = 4
  ): Promise<void> {
    if (!fs.existsSync(this.instanceDir)) {
      fs.mkdirSync(this.instanceDir, { recursive: true });
    }

    const protectedPaths = [
      'saves/',
      'screenshots/',
      'options.txt',
      'optionsof.txt',
      'usercache.json',
      'servers.dat',
      ...(manifest.protectedPaths || []),
      ...manifest.files.filter(f => f.policy === 'protected' || f.policy === 'user_managed').map(f => f.path)
    ];
    for (const file of manifest.files) resolveSafePath(this.instanceDir, file.path);
    for (const rule of manifest.cleanupRules || []) resolveSafePath(this.instanceDir, rule);

    const isProtected = (relPath: string): boolean => {
      const normalized = relPath.replace(/\\+/g, '/').toLowerCase();
      for (const prot of protectedPaths) {
        const normProt = prot.replace(/\\+/g, '/').toLowerCase();
        if (normProt.endsWith('/') && (normalized.startsWith(normProt) || normalized === normProt.slice(0, -1))) {
          return true;
        }
        if (normalized === normProt) {
          return true;
        }
      }
      return false;
    };

    // 1. Determine which files need downloading
    const filesToDownload: InstanceFileEntryV2[] = [];
    const validManifestPaths = new Set<string>();

    for (const file of manifest.files) {
      const normalizedPath = file.path.replace(/\\+/g, '/');
      validManifestPaths.add(normalizedPath);

      if (isProtected(normalizedPath)) {
        continue; // Never overwrite player-protected files
      }

      const localPath = resolveSafePath(this.instanceDir, normalizedPath);
      if ((file.policy === 'optional' || file.policy === 'default_off') && !fs.existsSync(localPath)) continue;
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
    const workers = Array.from({ length: Math.min(concurrency, totalFiles || 1) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const destPath = resolveSafePath(this.instanceDir, item.path);
        await downloadFile(item.url, destPath, {
          expectedSha1: item.sha1,
          expectedSha256: item.sha256,
          expectedSize: item.size > 0 ? item.size : undefined
        });

        completedCount++;
        if (onProgress) {
          onProgress(completedCount, totalFiles, item.path);
        }
      }
    });

    await Promise.all(workers);

    // 3. Cleanup useless files according to cleanupRules
    for (const rule of manifest.cleanupRules || []) {
      if (isProtected(rule)) continue;
      const ruleDir = resolveSafePath(this.instanceDir, rule);
      if (fs.existsSync(ruleDir) && fs.statSync(ruleDir).isDirectory()) {
        this.cleanDirectory(ruleDir, rule, validManifestPaths, isProtected);
      }
    }
  }

  private cleanDirectory(
    dirPath: string,
    prefix: string,
    validPaths: Set<string>,
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
        this.cleanDirectory(fullPath, prefix, validPaths, isProtected);
        // If directory is now empty, remove it
        if (fs.readdirSync(fullPath).length === 0) {
          try { fs.rmdirSync(fullPath); } catch (e) {}
        }
      } else {
        if (!validPaths.has(relPath)) {
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
