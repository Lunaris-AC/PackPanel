import crypto from 'crypto';
import fs from 'fs';

export async function computeFileHashes(filePath: string): Promise<{ sha1: string; sha256: string; size: number }> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`Fichier introuvable : ${filePath}`));
    }

    const sha1Hash = crypto.createHash('sha1');
    const sha256Hash = crypto.createHash('sha256');
    let totalBytes = 0;

    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      sha1Hash.update(chunk);
      sha256Hash.update(chunk);
      totalBytes += chunk.length;
    });

    stream.on('end', () => {
      resolve({
        sha1: sha1Hash.digest('hex').toLowerCase(),
        sha256: sha256Hash.digest('hex').toLowerCase(),
        size: totalBytes
      });
    });

    stream.on('error', reject);
  });
}

export function computeBufferSha1(buffer: Buffer): string {
  return crypto.createHash('sha1').update(buffer).digest('hex').toLowerCase();
}

export function computeBufferSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
}
