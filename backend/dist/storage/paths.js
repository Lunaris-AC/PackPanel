"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidPathError = void 0;
exports.assertSanitizedRelativePath = assertSanitizedRelativePath;
exports.sanitizeRelativePath = sanitizeRelativePath;
exports.encodeUrlPath = encodeUrlPath;
exports.checkWindowsCaseCollision = checkWindowsCaseCollision;
const WINDOWS_RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);
class InvalidPathError extends Error {
    statusCode = 400;
    constructor(message) {
        super(message);
        this.name = 'InvalidPathError';
    }
}
exports.InvalidPathError = InvalidPathError;
function assertSanitizedRelativePath(inputPath, isDirectory = false) {
    const res = sanitizeRelativePath(inputPath, isDirectory);
    if (!res.valid || !res.normalizedPath) {
        throw new InvalidPathError(res.error || 'Chemin relatif invalide');
    }
    return res.normalizedPath;
}
function sanitizeRelativePath(inputPath, isDirectory = false) {
    if (!inputPath || typeof inputPath !== 'string') {
        return { valid: false, error: 'Chemin vide ou invalide' };
    }
    // Check NUL bytes and CRLF
    if (/[\x00\r\n]/.test(inputPath)) {
        return { valid: false, error: 'Caractères de contrôle interdits (NUL, retour chariot)' };
    }
    // Convert Windows backslashes to forward slashes
    let normalized = inputPath.replace(/\\+/g, '/').trim();
    // Strip leading slash if any
    if (normalized.startsWith('/')) {
        normalized = normalized.replace(/^\/+/, '');
    }
    if (normalized === '' || normalized === '.') {
        return { valid: false, error: 'Le chemin ne peut pas être la racine' };
    }
    // Check segments
    const segments = normalized.split('/');
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // Empty segments in between (e.g. "a//b")
        if (seg === '' && i < segments.length - 1) {
            return { valid: false, error: 'Séquence de barres obliques consécutives interdite' };
        }
        if (seg === '' && i === segments.length - 1) {
            // trailing slash is allowed only if isDirectory is expected
            continue;
        }
        // Path traversal checks
        if (seg === '.' || seg === '..') {
            return { valid: false, error: 'Traversée de répertoire (".." ou ".") interdite' };
        }
        // Windows invalid filename characters: < > : " | ? *
        if (/[<>:"|?*]/.test(seg)) {
            return { valid: false, error: `Caractère interdit dans le segment "${seg}" (< > : " | ? *)` };
        }
        // Windows reserved device names (e.g. CON, NUL, AUX, COM1)
        const baseName = seg.split('.')[0].toUpperCase();
        if (WINDOWS_RESERVED_NAMES.has(baseName)) {
            return { valid: false, error: `Nom réservé Windows interdit : "${seg}"` };
        }
        // Trailing space or period in segment (Windows file system cannot address these)
        if (/[. ]$/.test(seg)) {
            return { valid: false, error: `Le segment "${seg}" ne peut pas se terminer par un espace ou un point` };
        }
    }
    // Enforce directory trailing slash if isDirectory
    if (isDirectory && !normalized.endsWith('/')) {
        normalized += '/';
    }
    else if (!isDirectory && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return { valid: true, normalizedPath: normalized };
}
/**
 * Safely encodes URL segments for MineLaunched / HTTP files while preserving '/'
 */
function encodeUrlPath(relativePath) {
    const isDir = relativePath.endsWith('/');
    const cleanPath = isDir ? relativePath.slice(0, -1) : relativePath;
    const parts = cleanPath.split('/');
    const encoded = parts.map(part => encodeURIComponent(part)).join('/');
    return isDir ? `${encoded}/` : encoded;
}
function checkWindowsCaseCollision(paths) {
    const seen = new Map();
    for (const p of paths) {
        const lower = p.toLowerCase();
        if (seen.has(lower)) {
            return {
                collision: true,
                first: seen.get(lower),
                second: p
            };
        }
        seen.set(lower, p);
    }
    return { collision: false };
}
//# sourceMappingURL=paths.js.map