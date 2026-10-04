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
    ) + (
      SELECT COUNT(*) FROM upload_files uf JOIN upload_sessions s ON s.id = uf.session_id
      WHERE uf.sha256 = objects.sha256 AND s.status NOT IN ('completed', 'failed', 'cancelled')
    ) + (
      SELECT COUNT(*) FROM file_history h WHERE h.previous_sha256 = objects.sha256 OR h.new_sha256 = objects.sha256
    ) + (
      SELECT COUNT(*) FROM launcher_projects lp WHERE lp.logo_url LIKE '%' || objects.sha256 || '%'
        OR lp.background_url LIKE '%' || objects.sha256 || '%' OR lp.icon_url LIKE '%' || objects.sha256 || '%'
    ) + (
      SELECT COUNT(*) FROM instances i WHERE i.icon_url LIKE '%' || objects.sha256 || '%'
    )
  `);

  // 2. Identify unreferenced objects (ref_count = 0)
  const orphans = await query(`
    SELECT sha256, size_bytes
    FROM objects
    WHERE ref_count = 0 AND created_at < NOW() - INTERVAL '1 day'
    LIMIT 500
  `);

  let deletedObjects = 0;
  let freedBytes = 0;

  for (const obj of orphans.rows) {
    const objPath = getObjectPath(obj.sha256);
    try {
      // Let foreign keys reject a newly referenced object before touching disk.
      const removed = await query(`DELETE FROM objects o WHERE sha256 = $1
        AND NOT EXISTS (SELECT 1 FROM release_files f WHERE f.sha256 = o.sha256)
        AND NOT EXISTS (SELECT 1 FROM upload_files f JOIN upload_sessions s ON s.id = f.session_id WHERE f.sha256 = o.sha256 AND s.status NOT IN ('completed', 'failed', 'cancelled'))
        AND NOT EXISTS (SELECT 1 FROM file_history h WHERE h.previous_sha256 = o.sha256 OR h.new_sha256 = o.sha256)
        AND NOT EXISTS (SELECT 1 FROM launcher_projects p WHERE p.logo_url LIKE '%' || o.sha256 || '%' OR p.background_url LIKE '%' || o.sha256 || '%' OR p.icon_url LIKE '%' || o.sha256 || '%')
        AND NOT EXISTS (SELECT 1 FROM instances i WHERE i.icon_url LIKE '%' || o.sha256 || '%')
        RETURNING sha256`, [obj.sha256]);
      if (!removed.rows.length) continue;
      if (fs.existsSync(objPath)) fs.unlinkSync(objPath);
      deletedObjects++;
      freedBytes += Number(obj.size_bytes);
    } catch (e) {
      console.error(`Error deleting orphan object ${obj.sha256}:`, e);
    }
  }

  return { deletedObjects, freedBytes };
}
