"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashStream = hashStream;
exports.hashBuffer = hashBuffer;
exports.hashFile = hashFile;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
/**
 * Computes SHA-1 and SHA-256 simultaneously in a single stream pass.
 */
async function hashStream(readableStream) {
    return new Promise((resolve, reject) => {
        const sha1Hash = crypto_1.default.createHash('sha1');
        const sha256Hash = crypto_1.default.createHash('sha256');
        let sizeBytes = 0;
        readableStream.on('data', (chunk) => {
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
function hashBuffer(buffer) {
    const sha1 = crypto_1.default.createHash('sha1').update(buffer).digest('hex').toLowerCase();
    const sha256 = crypto_1.default.createHash('sha256').update(buffer).digest('hex').toLowerCase();
    return {
        sha1,
        sha256,
        sizeBytes: buffer.length
    };
}
/**
 * Computes SHA-1 and SHA-256 for a file on disk in a single stream pass.
 */
async function hashFile(filePath) {
    const stream = fs_1.default.createReadStream(filePath);
    return hashStream(stream);
}
//# sourceMappingURL=hasher.js.map