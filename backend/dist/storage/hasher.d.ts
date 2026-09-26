import { Readable } from 'stream';
export interface HashResult {
    sha1: string;
    sha256: string;
    sizeBytes: number;
}
/**
 * Computes SHA-1 and SHA-256 simultaneously in a single stream pass.
 */
export declare function hashStream(readableStream: Readable): Promise<HashResult>;
/**
 * Computes SHA-1 and SHA-256 for a buffer in memory.
 */
export declare function hashBuffer(buffer: Buffer): HashResult;
/**
 * Computes SHA-1 and SHA-256 for a file on disk in a single stream pass.
 */
export declare function hashFile(filePath: string): Promise<HashResult>;
