import fs from 'fs';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { computeFileHashes } from './hasher.js';

export interface DownloadOptions {
  expectedSha1?: string;
  expectedSha256?: string;
  expectedSize?: number;
  onProgress?: (transferredBytes: number, totalBytes: number) => void;
  maxRetries?: number;
}

export async function downloadFile(
  url: string,
  destPath: string,
  options: DownloadOptions = {}
): Promise<void> {
  const { expectedSha1, expectedSha256, expectedSize, onProgress, maxRetries = 3 } = options;

  // Check if file already exists and matches expected hashes
  if (fs.existsSync(destPath)) {
    try {
      const hashes = await computeFileHashes(destPath);
      let matches = true;
      if (expectedSha1 && hashes.sha1 !== expectedSha1.toLowerCase()) matches = false;
      if (expectedSha256 && hashes.sha256 !== expectedSha256.toLowerCase()) matches = false;
      if (expectedSize !== undefined && hashes.size !== expectedSize) matches = false;

      if (matches) {
        if (onProgress && expectedSize) onProgress(expectedSize, expectedSize);
        return; // Valid file already exists
      }
    } catch (e) {
      // Re-download
    }
  }

  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    const tempPath = `${destPath}.tmp.${process.pid}.${Date.now()}`;

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120000),
        headers: {
          'User-Agent': 'PackPanel-Launcher-Engine/2.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} lors du téléchargement de ${url}`);
      }

      const totalBytes = Number(response.headers.get('content-length') || expectedSize || 0);
      let transferred = 0;

      if (!response.body) {
        throw new Error(`Corps de réponse vide pour ${url}`);
      }

      const counter = new Transform({ transform(chunk, _encoding, callback) {
        transferred += chunk.length;
        onProgress?.(transferred, totalBytes);
        callback(null, chunk);
      }});
      await pipeline(Readable.fromWeb(response.body as any), counter, fs.createWriteStream(tempPath));
      if (expectedSize !== undefined && transferred !== expectedSize) throw new Error(`Taille invalide pour ${url}: ${transferred} au lieu de ${expectedSize}`);

      // Verify hashes if specified
      if (expectedSha1 || expectedSha256) {
        const hashes = await computeFileHashes(tempPath);
        if (expectedSha1 && hashes.sha1 !== expectedSha1.toLowerCase()) {
          throw new Error(`Checksum SHA-1 invalide pour ${url}. Attendu: ${expectedSha1}, obtenu: ${hashes.sha1}`);
        }
        if (expectedSha256 && hashes.sha256 !== expectedSha256.toLowerCase()) {
          throw new Error(`Checksum SHA-256 invalide pour ${url}. Attendu: ${expectedSha256}, obtenu: ${hashes.sha256}`);
        }
      }

      // Atomic rename
      fs.renameSync(tempPath, destPath);
      return;
    } catch (err: any) {
      lastError = err;
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error(`Échec du téléchargement de ${url}`);
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      'User-Agent': 'PackPanel-Launcher-Engine/2.0',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} lors de la requête sur ${url}`);
  }

  return response.json() as Promise<T>;
}
