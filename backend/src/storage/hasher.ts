import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';

export interface HashResult {
  sha1: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Computes SHA-1 and SHA-256 simultaneously in a single stream pass.
 */
export async function hashStream(readableStream: Readable): Promise<HashResult> {
  return new Promise((resolve, reject) => {
    const sha1Hash = crypto.createHash('sha1');
    const sha256Hash = crypto.createHash('sha256');
    let sizeBytes = 0;

    readableStream.on('data', (chunk: Buffer) => {
      sizeBytes += chunk.length;
      sha1Hash.update(chunk);
      sha256Hash.update(chunk);
    });

    readableStream.on('end', () => {
      resolve({
        sha1: sha1Hash.digest('hex').toLowerCase(),
        sha256: sha256Hash.digest('hex').toLowerCase(),
        sizeBytes
      });
    });

    readableStream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Computes SHA-1 and SHA-256 for a buffer in memory.
 */
export function hashBuffer(buffer: Buffer): HashResult {
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex').toLowerCase();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
  return {
    sha1,
    sha256,
    sizeBytes: buffer.length
  };
}

/**
 * Computes SHA-1 and SHA-256 for a file on disk in a single stream pass.
 */
export async function hashFile(filePath: string): Promise<HashResult> {
  const stream = fs.createReadStream(filePath);
  return hashStream(stream);
}

