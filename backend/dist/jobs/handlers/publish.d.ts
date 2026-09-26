export interface SealAndBuildReleasePayload {
    sessionId: string;
}
export interface PublishReleasePayload {
    releaseId: string;
    endpointId: string;
}
export declare function handleSealAndBuildRelease(payload: SealAndBuildReleasePayload): Promise<void>;
/**
 * Atomically publishes a release, updates index.php and database.
 */
export declare function publishReleaseInternal(endpointId: string, releaseDbId: string, endpointSlug: string, manifestJson: string, releaseDir: string): Promise<void>;
