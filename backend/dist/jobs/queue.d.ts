import { JobRecord, JobType } from './types';
export declare class JobQueue {
    /**
     * Enqueues a new job into PostgreSQL.
     */
    static enqueue<T = any>(type: JobType, payload: T, priority?: number, maxAttempts?: number): Promise<string>;
    /**
     * Checks out the next pending or timed-out job atomically using SKIP LOCKED.
     */
    static fetchNext(workerId: string): Promise<JobRecord | null>;
    /**
     * Sends a heartbeat for a running job to prevent lease expiration.
     */
    static heartbeat(jobId: string, workerId: string): Promise<void>;
    /**
     * Marks a job as completed.
     */
    static complete(jobId: string, result?: any): Promise<void>;
    /**
     * Marks a job as failed, or re-queues it if attempts < max_attempts.
     */
    static fail(jobId: string, errorMessage: string): Promise<void>;
}
export declare function enqueueJob<T = any>(type: JobType, payload: T, priority?: number, maxAttempts?: number): Promise<{
    id: string;
}>;
