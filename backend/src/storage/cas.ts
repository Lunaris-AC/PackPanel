import fs from 'fs';
import path from 'path';
import { OBJECTS_DIR } from '../config';
import { hashFile, HashResult } from './hasher';
import { query } from '../db';

export interface CasObject {
  sha256: string;
  sha1: string;
  sizeBytes: number;
  mimeType: string;
  storageRelPath: string;
}

export function getObjectPath(sha256: string): string {
  const dir1 = sha256.substring(0, 2);
  const dir2 = sha256.substring(2, 4);
  return path.join(OBJECTS_DIR, dir1, dir2, sha256);
}

export const getCasObjectPath = getObjectPath;

export async function storeBufferInCas(buffer: Buffer, sha256: string, sha1: string): Promise<void> {
  const targetPath = getObjectPath(sha256);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  }
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, buffer);
  }
  const relPath = getObjectRelPath(sha256);
  await query(
    `INSERT INTO objects (sha256, sha1, size_bytes, storage_rel_path, ref_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (sha256) DO UPDATE SET ref_count = objects.ref_count + 1`,
    [sha256, sha1, buffer.length, relPath]
  );
}


export function getObjectRelPath(sha256: string): string {
  const dir1 = sha256.substring(0, 2);
  const dir2 = sha256.substring(2, 4);
  return path.join(dir1, dir2, sha256).replace(/\\/g, '/');
}


/**
 * Stores a file into Content-Addressed Storage.
 * Deduplicates automatically if the object is already stored.
 */
export async function storeObjectFromPath(
  tempFilePath: string,
  precalculated?: HashResult,
  mimeType: string = 'application/octet-stream'
): Promise<CasObject> {
  const hashes = precalculated || await hashFile(tempFilePath);
  const targetPath = getObjectPath(hashes.sha256);
  const relPath = getObjectRelPath(hashes.sha256);

  // Check if object already exists in database
  const existing = await query(
    'SELECT sha256, sha1, size_bytes, mime_type, storage_rel_path FROM objects WHERE sha256 = $1',
    [hashes.sha256]
  );

  if (existing.rows.length > 0) {
    // Already stored in CAS! Deduplication hit.
    // Clean up temporary file
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (e) {
      // ignore
    }

    const row = existing.rows[0];
    return {
      sha256: row.sha256,
      sha1: row.sha1,
      sizeBytes: Number(row.size_bytes),
      mimeType: row.mime_type,
      storageRelPath: row.storage_rel_path
    };
  }

  // Not in CAS yet. Ensure target directory exists.
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  }

  // Move or copy file
  try {
    fs.renameSync(tempFilePath, targetPath);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(tempFilePath, targetPath);
      fs.unlinkSync(tempFilePath);
    } else {
      throw err;
    }
  }

  // Set read-only permissions on stored object
  fs.chmodSync(targetPath, 0o640);

  // Record in database
  await query(
    `INSERT INTO objects (sha256, sha1, size_bytes, mime_type, storage_rel_path, ref_count)
     VALUES ($1, $2, $3, $4, $5, 1)
     ON CONFLICT (sha256) DO NOTHING`,
    [hashes.sha256, hashes.sha1, hashes.sizeBytes, mimeType, relPath]
  );

  return {
    sha256: hashes.sha256,
    sha1: hashes.sha1,
    sizeBytes: hashes.sizeBytes,
    mimeType,
    storageRelPath: relPath
  };
}

/**
 * Links a CAS object to a destination file in a release directory.
 * Uses hardlinks for zero-copy performance, with fallback to copy.
 */
export function linkObjectToRelease(sha256: string, destinationFilePath: string): void {
  const sourcePath = getObjectPath(sha256);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Objet CAS introuvable pour le hash ${sha256}`);
  }

  const destDir = path.dirname(destinationFilePath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true, mode: 0o755 });
  }

  if (fs.existsSync(destinationFilePath)) {
    fs.unlinkSync(destinationFilePath);
  }

  try {
    fs.linkSync(sourcePath, destinationFilePath);
  } catch (err: any) {
    // Fallback to copy if hardlink is not supported across filesystem boundaries
    fs.copyFileSync(sourcePath, destinationFilePath);
  }
  // Published files are read by the unprivileged Nginx container. CAS parent
  // directories remain private, including when this is a shared inode.
  fs.chmodSync(destinationFilePath, 0o644);
}
