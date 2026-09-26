import fs from 'fs';
import { query } from '../../db';
import { storeObjectFromPath } from '../../storage/cas';
import { sanitizeRelativePath } from '../../storage/paths';
import { JobQueue } from '../queue';

export interface ProcessUploadPayload {
  uploadFileId: string;
  tempFilePath: string;
  sessionId: string;
  relativePath: string;
  expectedSize: number;
}

export async function handleProcessUploadFile(payload: ProcessUploadPayload): Promise<void> {
  const { uploadFileId, tempFilePath, sessionId, relativePath, expectedSize } = payload;

  if (!fs.existsSync(tempFilePath)) {
    throw new Error(`Fichier temporaire d'upload introuvable : ${tempFilePath}`);
  }

  const pathValidation = sanitizeRelativePath(relativePath);
  if (!pathValidation.valid || !pathValidation.normalizedPath) {
    throw new Error(`Chemin invalide pour l'upload : ${pathValidation.error}`);
  }
  const cleanPath = pathValidation.normalizedPath;

  // Store in CAS (computes SHA-1, SHA-256 and deduplicates)
  const casObj = await storeObjectFromPath(tempFilePath);

  // Update upload_file in database
  await query(
    `UPDATE upload_files
     SET sha256 = $1,
         sha1 = $2,
         received_size = $3,
         status = 'verified'
     WHERE id = $4`,
    [casObj.sha256, casObj.sha1, casObj.sizeBytes, uploadFileId]
  );

  // Update session progress
  const sessionRes = await query(
    `UPDATE upload_sessions
     SET received_files_count = (SELECT COUNT(*) FROM upload_files WHERE session_id = $1 AND status = 'verified'),
         total_bytes_received = (SELECT COALESCE(SUM(received_size), 0) FROM upload_files WHERE session_id = $1 AND status = 'verified'),
         updated_at = NOW()
     WHERE id = $1
     RETURNING status, expected_files_count, received_files_count`,
    [sessionId]
  );

  if (sessionRes.rows.length > 0) {
    const session = sessionRes.rows[0];
    // If the session has been sealed by the client and all files are verified, build and publish release
    if (session.status === 'sealed' && session.received_files_count >= session.expected_files_count) {
      await JobQueue.enqueue('seal_and_build_release', { sessionId });
    }
  }
}
