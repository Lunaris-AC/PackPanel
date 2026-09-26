"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGarbageCollection = handleGarbageCollection;
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../../db");
const cas_1 = require("../../storage/cas");
async function handleGarbageCollection() {
    // 1. Reconcile ref_count for all objects
    await (0, db_1.query)(`
    UPDATE objects
    SET ref_count = (
      SELECT COUNT(*)
      FROM release_files
      WHERE release_files.sha256 = objects.sha256
    )
  `);
    // 2. Identify unreferenced objects (ref_count = 0)
    const orphans = await (0, db_1.query)(`
    SELECT sha256, size_bytes
    FROM objects
    WHERE ref_count = 0
    LIMIT 500
  `);
    let deletedObjects = 0;
    let freedBytes = 0;
    for (const obj of orphans.rows) {
        const objPath = (0, cas_1.getObjectPath)(obj.sha256);
        try {
            if (fs_1.default.existsSync(objPath)) {
                fs_1.default.unlinkSync(objPath);
            }
            await (0, db_1.query)('DELETE FROM objects WHERE sha256 = $1', [obj.sha256]);
            deletedObjects++;
            freedBytes += Number(obj.size_bytes);
        }
        catch (e) {
            console.error(`Error deleting orphan object ${obj.sha256}:`, e);
        }
    }
    return { deletedObjects, freedBytes };
}
//# sourceMappingURL=gc.js.map