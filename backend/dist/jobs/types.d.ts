export type JobType = 'process_upload_file' | 'seal_and_build_release' | 'extract_zip_import' | 'publish_release' | 'scan_incoming_folder' | 'gc_orphan_objects';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface JobRecord<T = any> {
    id: string;
    type: JobType;
    payload: T;
    status: JobStatus;
    priority: number;
    attempts: number;
    max_attempts: number;
    locked_by: string | null;
    heartbeat_at: Date | null;
    error_message: string | null;
    result: any | null;
    created_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
}
