"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
const config_1 = require("../config");
const cas_1 = require("../storage/cas");
const hasher_1 = require("../storage/hasher");
const paths_1 = require("../storage/paths");
const manifest_1 = require("../storage/manifest");
const publish_1 = require("../jobs/handlers/publish");
async function scanDirectoryRecursive(dir, baseDir) {
    const entries = fs_1.default.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(path_1.default.relative(baseDir, fullPath).replace(/\\/g, '/') + '/');
            const subFiles = await scanDirectoryRecursive(fullPath, baseDir);
            files = files.concat(subFiles);
        }
        else if (entry.isFile()) {
            files.push(path_1.default.relative(baseDir, fullPath).replace(/\\/g, '/'));
        }
    }
    return files;
}
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    if (!command || command === '--help' || command === '-h') {
        console.log(`
PackPanel CLI - Gestionnaire de distribution MineLaunched

Usage:
  packpanel-cli seal <source_folder> --slug <slug> [--mode <add_replace|full_replace>]
  packpanel-cli gc
  packpanel-cli status
    `);
        process.exit(0);
    }
    if (command === 'seal') {
        const folderArg = args[1];
        if (!folderArg || !fs_1.default.existsSync(folderArg)) {
            console.error(`Erreur: dossier source introuvable: ${folderArg}`);
            process.exit(1);
        }
        const slugIdx = args.indexOf('--slug');
        if (slugIdx === -1 || !args[slugIdx + 1]) {
            console.error(`Erreur: option --slug requise`);
            process.exit(1);
        }
        const slug = args[slugIdx + 1].trim().toLowerCase();
        const modeIdx = args.indexOf('--mode');
        const mode = (modeIdx !== -1 && args[modeIdx + 1] === 'full_replace') ? 'full_replace' : 'add_replace';
        console.log(`[PackPanel CLI] Préparation du lot depuis "${folderArg}" pour l'endpoint "${slug}" (mode: ${mode})...`);
        // Verify endpoint
        const epRes = await (0, db_1.query)('SELECT * FROM endpoints WHERE slug = $1', [slug]);
        if (epRes.rows.length === 0) {
            console.error(`Erreur: endpoint introuvable pour le slug "${slug}"`);
            process.exit(1);
        }
        const endpoint = epRes.rows[0];
        // Scan folder
        const allPaths = await scanDirectoryRecursive(folderArg, folderArg);
        console.log(`[PackPanel CLI] ${allPaths.length} élément(s) détecté(s). Hachage et déduplication CAS...`);
        // Get active release if add_replace
        const activeRelRes = await (0, db_1.query)('SELECT id, release_id FROM releases WHERE endpoint_id = $1 AND is_active = TRUE', [endpoint.id]);
        const activeRelease = activeRelRes.rows[0] || null;
        const filesMap = new Map();
        if (mode === 'add_replace' && activeRelease) {
            const existing = await (0, db_1.query)('SELECT * FROM release_files WHERE release_id = $1', [activeRelease.id]);
            for (const f of existing.rows) {
                filesMap.set(f.relative_path, {
                    sha256: f.sha256,
                    sha1: f.sha1,
                    sizeBytes: Number(f.size_bytes),
                    isDir: f.is_dir
                });
            }
        }
        // Process new files
        for (const rel of allPaths) {
            const isDir = rel.endsWith('/');
            const cleanRel = (0, paths_1.assertSanitizedRelativePath)(rel, isDir);
            const fullPath = path_1.default.join(folderArg, rel);
            if (isDir) {
                filesMap.set(cleanRel, {
                    sha256: '',
                    sha1: '',
                    sizeBytes: 0,
                    isDir: true
                });
            }
            else {
                const hashRes = await (0, hasher_1.hashFile)(fullPath);
                await (0, cas_1.storeObjectFromPath)(fullPath, hashRes);
                filesMap.set(cleanRel, {
                    sha256: hashRes.sha256,
                    sha1: hashRes.sha1,
                    sizeBytes: hashRes.sizeBytes,
                    isDir: false
                });
            }
        }
        // Next version num
        const maxVerRes = await (0, db_1.query)('SELECT COALESCE(MAX(version_num), 0) + 1 as next_v FROM releases WHERE endpoint_id = $1', [endpoint.id]);
        const nextVer = parseInt(maxVerRes.rows[0].next_v, 10);
        const releaseIdStr = `r${String(nextVer).padStart(4, '0')}`;
        console.log(`[PackPanel CLI] Assemblage de la version ${releaseIdStr}...`);
        const releaseDir = path_1.default.join(config_1.ENDPOINTS_DIR, slug, 'releases', releaseIdStr);
        if (!fs_1.default.existsSync(releaseDir))
            fs_1.default.mkdirSync(releaseDir, { recursive: true, mode: 0o755 });
        const manifestInput = [];
        let totalBytes = 0;
        for (const [relPath, fileInfo] of filesMap.entries()) {
            if (!fileInfo.isDir) {
                const dest = path_1.default.join(releaseDir, relPath);
                (0, cas_1.linkObjectToRelease)(fileInfo.sha256, dest);
                totalBytes += fileInfo.sizeBytes;
            }
            manifestInput.push({
                relativePath: relPath,
                sha1: fileInfo.sha1,
                isDir: fileInfo.isDir
            });
        }
        const manifest = (0, manifest_1.buildMineLaunchedManifest)(manifestInput, slug, releaseIdStr, config_1.config.FILES_FQDN, endpoint.cleanup_rules || ['mods']);
        const validation = (0, manifest_1.validateMineLaunchedContract)(manifest);
        if (!validation.valid) {
            console.error(`Erreur validation contrat MineLaunched:`, validation.errors);
            process.exit(1);
        }
        const manifestJson = JSON.stringify(manifest, null, 2);
        fs_1.default.writeFileSync(path_1.default.join(releaseDir, 'manifest.json'), manifestJson, 'utf8');
        // Insert DB release
        const newRelId = await (0, db_1.withTransaction)(async (client) => {
            const relInsert = await client.query(`INSERT INTO releases (endpoint_id, release_id, version_num, status, is_active, is_pinned, manifest_content, total_files, total_bytes)
         VALUES ($1, $2, $3, 'draft', FALSE, FALSE, $4, $5, $6)
         RETURNING id`, [endpoint.id, releaseIdStr, nextVer, manifestJson, filesMap.size, totalBytes]);
            const relId = relInsert.rows[0].id;
            for (const [relPath, fileInfo] of filesMap.entries()) {
                await client.query(`INSERT INTO release_files (release_id, relative_path, sha256, sha1, size_bytes, is_dir)
           VALUES ($1, $2, $3, $4, $5, $6)`, [relId, relPath, fileInfo.isDir ? null : fileInfo.sha256, fileInfo.isDir ? null : fileInfo.sha1, fileInfo.sizeBytes, fileInfo.isDir]);
            }
            return relId;
        });
        // Publish atomically
        await (0, publish_1.publishReleaseInternal)(endpoint.id, newRelId, slug, manifestJson, releaseDir);
        console.log(`[PackPanel CLI] Version ${releaseIdStr} scellée et publiée avec succès !`);
        console.log(`URL: https://${config_1.config.FILES_FQDN}/${slug}/index.php`);
        process.exit(0);
    }
    if (command === 'status') {
        const epCount = await (0, db_1.query)('SELECT COUNT(*) FROM endpoints');
        const relCount = await (0, db_1.query)('SELECT COUNT(*) FROM releases WHERE is_active = TRUE');
        const objCount = await (0, db_1.query)('SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) as bytes FROM objects');
        console.log(`[PackPanel Status]`);
        console.log(`  Endpoints: ${epCount.rows[0].count}`);
        console.log(`  Versions actives: ${relCount.rows[0].count}`);
        console.log(`  Objets CAS: ${objCount.rows[0].count} (${(Number(objCount.rows[0].bytes) / 1024 / 1024).toFixed(2)} Mo)`);
        process.exit(0);
    }
    console.error(`Commande inconnue: ${command}`);
    process.exit(1);
}
main().catch(err => {
    console.error('[PackPanel CLI] Erreur fatale:', err);
    process.exit(1);
});
//# sourceMappingURL=packpanel-cli.js.map