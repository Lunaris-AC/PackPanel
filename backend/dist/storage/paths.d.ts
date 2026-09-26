export interface SanitizedPathResult {
    valid: boolean;
    normalizedPath?: string;
    error?: string;
}
export declare class InvalidPathError extends Error {
    statusCode: number;
    constructor(message: string);
}
export declare function assertSanitizedRelativePath(inputPath: string, isDirectory?: boolean): string;
export declare function sanitizeRelativePath(inputPath: string, isDirectory?: boolean): SanitizedPathResult;
/**
 * Safely encodes URL segments for MineLaunched / HTTP files while preserving '/'
 */
export declare function encodeUrlPath(relativePath: string): string;
export interface CaseCollisionResult {
    collision: boolean;
    first?: string;
    second?: string;
}
export declare function checkWindowsCaseCollision(paths: string[]): CaseCollisionResult;
