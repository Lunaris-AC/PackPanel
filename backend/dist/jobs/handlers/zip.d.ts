import yauzl from 'yauzl';
export interface ExtractZipPayload {
    zipFilePath: string;
    endpointId: string;
    userId: string;
    mode: 'add_replace' | 'full_replace';
    stripRootFolder?: boolean;
}
export declare function openZip(zipPath: string): Promise<yauzl.ZipFile>;
export declare function handleExtractZipImport(payload: ExtractZipPayload): Promise<void>;
