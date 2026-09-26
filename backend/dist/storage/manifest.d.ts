export interface MineLaunchedFileEntry {
    path: string;
    checksumSHA1: string;
    url: string;
}
export interface MineLaunchedDirEntry {
    path: string;
    checksumSHA1: false;
    url: string;
}
export interface MineLaunchedDirective {
    dirCheckUselessFiles: string;
}
export type MineLaunchedEntry = MineLaunchedFileEntry | MineLaunchedDirEntry | MineLaunchedDirective;
export interface FileRecordInput {
    relativePath: string;
    sha1?: string | null;
    isDir: boolean;
}
/**
 * Builds the canonical MineLaunched JSON manifest.
 */
export declare function buildMineLaunchedManifest(files: FileRecordInput[], endpointSlug: string, releaseId: string, filesFqdn: string, cleanupRules?: string[]): MineLaunchedEntry[];
/**
 * Validates whether a JSON data structure strictly conforms to the MineLaunched contract.
 */
export declare function validateMineLaunchedContract(manifestData: any): {
    valid: boolean;
    errors: string[];
};
