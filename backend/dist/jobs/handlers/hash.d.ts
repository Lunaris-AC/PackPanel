export interface ProcessUploadPayload {
    uploadFileId: string;
    tempFilePath: string;
    sessionId: string;
    relativePath: string;
    expectedSize: number;
}
export declare function handleProcessUploadFile(payload: ProcessUploadPayload): Promise<void>;
