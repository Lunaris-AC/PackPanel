import { HashResult } from './hasher';
export interface CasObject {
    sha256: string;
    sha1: string;
    sizeBytes: number;
    mimeType: string;
    storageRelPath: string;
}
export declare function getObjectPath(sha256: string): string;
export declare const getCasObjectPath: typeof getObjectPath;
export declare function storeBufferInCas(buffer: Buffer, sha256: string, sha1: string): Promise<void>;
export declare function getObjectRelPath(sha256: string): string;
/**
 * Stores a file into Content-Addressed Storage.
 * Deduplicates automatically if the object is already stored.
 */
export declare function storeObjectFromPath(tempFilePath: string, precalculated?: HashResult, mimeType?: string): Promise<CasObject>;
/**
 * Links a CAS object to a destination file in a release directory.
 * Uses hardlinks for zero-copy performance, with fallback to copy.
 */
export declare function linkObjectToRelease(sha256: string, destinationFilePath: string): void;
