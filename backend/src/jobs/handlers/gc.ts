import fs from 'fs';
import { query } from '../../db';
import { getObjectPath } from '../../storage/cas';

export async function handleGarbageCollection(): Promise<{ deletedObjects: number; freedBytes: number }> {
  // 1. Reconcile ref_count for all objects
  await query(`
    UPDATE objects
    SET ref_count = (
      SELECT COUNT(*)
      FROM release_files
      WHERE release_files.sha256 = objects.sha256
    )
  `);

  // 2. Identify unreferenced objects (ref_count = 0)
  const orphans = await query(`
    SELECT sha256, size_bytes
    FROM objects
    WHERE ref_count = 0
    LIMIT 500
  `);

  let deletedObjects = 0;
  let freedBytes = 0;

  for (const obj of orphans.rows) {
    const objPath = getObjectPath(obj.sha256);
    try {
      if (fs.existsSync(objPath)) {
        fs.unlinkSync(objPath);
      }
      await query('DELETE FROM objects WHERE sha256 = $1', [obj.sha256]);
      deletedObjects++;
      freedBytes += Number(obj.size_bytes);
    } catch (e) {
      console.error(`Error deleting orphan object ${obj.sha256}:`, e);
    }
  }

  return { deletedObjects, freedBytes };
}
