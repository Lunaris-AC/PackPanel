"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openZip = openZip;
exports.handleExtractZipImport = handleExtractZipImport;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const yauzl_1 = __importDefault(require("yauzl"));
const db_1 = require("../../db");
const paths_1 = require("../../storage/paths");
const cas_1 = require("../../storage/cas");
const config_1 = require("../../config");
const queue_1 = require("../queue");
function openZip(zipPath) {
    return new Promise((resolve, reject) => {
        yauzl_1.default.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
            if (err)
                return reject(err);
            resolve(zipfile);
        });
    });
}
async function handleExtractZipImport(payload) {
    const { zipFilePath, endpointId, userId, mode, stripRootFolder = false } = payload;
    if (!fs_1.default.existsSync(zipFilePath)) {
        throw new Error(`Archive ZIP introuvable : ${zipFilePath}`);
    }
    const zipfile = await openZip(zipFilePath);
    // First pass: inspect archive security and detect CurseForge / Modrinth manifest-only zips
    let totalUncompressedBytes = 0;
    let entryCount = 0;
    let hasManifestJson = false;
    let hasModrinthJson = false;
    let hasRealMods = false;
    let commonPrefix = null;
    const entriesToExtract = [];
    const inspectPromise = new Promise((resolve, reject) => {
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
            entryCount++;
            if (entryCount > config_1.config.MAX_ZIP_ENTRY_COUNT) {
                return reject(new Error(`L'archive dépasse la limite maximale de ${config_1.config.MAX_ZIP_ENTRY_COUNT} entrées (protection zip bomb).`));
            }
            totalUncompressedBytes += entry.uncompressedSize;
            if (totalUncompressedBytes > config_1.config.MAX_ZIP_EXTRACT_SIZE_MIB * 1024 * 1024) {
                return reject(new Error(`La taille décompressée dépasse la limite de ${config_1.config.MAX_ZIP_EXTRACT_SIZE_MIB} Mio (protection zip bomb).`));
            }
            const fileName = entry.fileName.replace(/\\+/g, '/');
            // Check CurseForge or Modrinth launcher exports
            if (fileName === 'manifest.json')
                hasManifestJson = true;
            if (fileName === 'modrinth.index.json')
                hasModrinthJson = true;
            if (fileName.startsWith('mods/') && fileName.endsWith('.jar'))
                hasRealMods = true;
            // Detect common root folder
            if (stripRootFolder) {
                const firstSlash = fileName.indexOf('/');
                if (firstSlash !== -1) {
                    const rootFolder = fileName.substring(0, firstSlash + 1);
                    if (commonPrefix === null) {
                        commonPrefix = rootFolder;
                    }
                    else if (commonPrefix !== rootFolder) {
                        commonPrefix = ''; // multiple root folders
                    }
                }
            }
            const isDir = /\/$/.test(fileName);
            zipfile.readEntry();
        });
        zipfile.on('end', () => resolve());
        zipfile.on('error', (err) => reject(err));
    });
    await inspectPromise;
    // Check if this is an export manifest without binaries
    if ((hasManifestJson || hasModrinthJson) && !hasRealMods) {
        throw new Error(`L'archive fournie est un export de launcher (CurseForge/Modrinth) contenant uniquement un manifeste sans les binaires des mods. PackPanel requiert les vrais fichiers du modpack (dossiers mods/, config/, etc.).`);
    }
    // Second pass: extract and store files
    const zipfile2 = await openZip(zipFilePath);
    const stagingSessionDir = path_1.default.join(config_1.UPLOADS_DIR, `zip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);
    fs_1.default.mkdirSync(stagingSessionDir, { recursive: true, mode: 0o750 });
    // Create an upload_session for this zip import
    const sessionRes = await (0, db_1.query)(`INSERT INTO upload_sessions (endpoint_id, user_id, mode, status, expected_files_count, expires_at)
     VALUES ($1, $2, $3, 'processing', 0, NOW() + INTERVAL '24 hours')
     RETURNING id`, [endpointId, userId, mode]);
    const sessionId = sessionRes.rows[0].id;
    const validEntries = [];
    const extractPromise = new Promise((resolve, reject) => {
        zipfile2.readEntry();
        zipfile2.on('entry', (entry) => {
            let rawPath = entry.fileName.replace(/\\+/g, '/');
            // Strip common root if requested and valid
            if (stripRootFolder && commonPrefix && rawPath.startsWith(commonPrefix)) {
                rawPath = rawPath.substring(commonPrefix.length);
            }
            if (!rawPath || rawPath === '' || rawPath === '/') {
                zipfile2.readEntry();
                return;
            }
            const isDir = /\/$/.test(rawPath);
            const validation = (0, paths_1.sanitizeRelativePath)(rawPath, isDir);
            if (!validation.valid || !validation.normalizedPath) {
                // Skip illegal or root entries safely
                zipfile2.readEntry();
                return;
            }
            const cleanPath = validation.normalizedPath;
            if (isDir) {
                validEntries.push({ cleanPath, isDir: true, sha256: '', sha1: '', size: 0 });
                zipfile2.readEntry();
                return;
            }
            // Extract file to staging
            const tempEntryPath = path_1.default.join(stagingSessionDir, `e_${Math.random().toString(36).substring(2, 10)}`);
            zipfile2.openReadStream(entry, (err, readStream) => {
                if (err || !readStream) {
                    return reject(err || new Error(`Impossible d'extraire ${cleanPath}`));
                }
                const writeStream = fs_1.default.createWriteStream(tempEntryPath);
                readStream.pipe(writeStream);
                writeStream.on('finish', async () => {
                    try {
                        // Store directly in CAS
                        const casObj = await (0, cas_1.storeObjectFromPath)(tempEntryPath);
                        validEntries.push({
                            cleanPath,
                            isDir: false,
                            sha256: casObj.sha256,
                            sha1: casObj.sha1,
                            size: casObj.sizeBytes
                        });
                        zipfile2.readEntry();
                    }
                    catch (e) {
                        reject(e);
                    }
                });
                writeStream.on('error', (err) => reject(err));
            });
        });
        zipfile2.on('end', () => resolve());
        zipfile2.on('error', (err) => reject(err));
    });
    await extractPromise;
    // Insert upload_files
    for (const item of validEntries) {
        if (!item.isDir) {
            await (0, db_1.query)(`INSERT INTO upload_files (session_id, relative_path, expected_size, received_size, sha256, sha1, status)
         VALUES ($1, $2, $3, $3, $4, $5, 'verified')
         ON CONFLICT (session_id, relative_path) DO NOTHING`, [sessionId, item.cleanPath, item.size, item.sha256, item.sha1]);
        }
    }
    // Update session
    const fileCount = validEntries.filter(e => !e.isDir).length;
    const totalBytes = validEntries.reduce((sum, e) => sum + e.size, 0);
    await (0, db_1.query)(`UPDATE upload_sessions
     SET expected_files_count = $1,
         received_files_count = $1,
         total_bytes_expected = $2,
         total_bytes_received = $2,
         status = 'sealed'
     WHERE id = $3`, [fileCount, totalBytes, sessionId]);
    // Clean staging
    try {
        fs_1.default.rmSync(stagingSessionDir, { recursive: true, force: true });
        if (fs_1.default.existsSync(zipFilePath))
            fs_1.default.unlinkSync(zipFilePath);
    }
    catch (e) {
        // ignore
    }
    // Enqueue build and publish release
    await queue_1.JobQueue.enqueue('seal_and_build_release', { sessionId });
}
//# sourceMappingURL=zip.js.map