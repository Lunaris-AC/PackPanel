import { query } from '../db';
import { JobRecord, JobType } from './types';

export class JobQueue {
  /**
   * Enqueues a new job into PostgreSQL.
   */
  static async enqueue<T = any>(
    type: JobType,
    payload: T,
    priority: number = 0,
    maxAttempts: number = 3
  ): Promise<string> {
    const res = await query(
      `INSERT INTO jobs (job_type, payload, priority, max_attempts)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [type, JSON.stringify(payload), priority, maxAttempts]
    );
    return res.rows[0].id;
  }

  /**
   * Checks out the next pending or timed-out job atomically using SKIP LOCKED.
   */

  static async fetchNext(workerId: string): Promise<JobRecord | null> {
    const res = await query(
      `UPDATE jobs
       SET status = 'running',
           locked_by = $1,
           started_at = NOW(),
           heartbeat_at = NOW(),
           attempts = attempts + 1
       WHERE id = (
         SELECT id FROM jobs
         WHERE (status = 'pending')
            OR (status = 'running' AND heartbeat_at < NOW() - INTERVAL '2 minutes')
         ORDER BY priority DESC, created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [workerId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    return res.rows[0] as JobRecord;
  }

  /**
   * Sends a heartbeat for a running job to prevent lease expiration.
   */
  static async heartbeat(jobId: string, workerId: string): Promise<void> {
    await query(
      `UPDATE jobs
       SET heartbeat_at = NOW()
       WHERE id = $1 AND locked_by = $2 AND status = 'running'`,
      [jobId, workerId]
    );
  }

  /**
   * Marks a job as completed.
   */
  static async complete(jobId: string, result: any = null): Promise<void> {
    await query(
      `UPDATE jobs
       SET status = 'completed',
           completed_at = NOW(),
           result = $2
       WHERE id = $1`,
      [jobId, result ? JSON.stringify(result) : null]
    );
  }

  /**
   * Marks a job as failed, or re-queues it if attempts < max_attempts.
   */
  static async fail(jobId: string, errorMessage: string): Promise<void> {
    const res = await query('SELECT attempts, max_attempts FROM jobs WHERE id = $1', [jobId]);
    if (res.rows.length === 0) return;

    const { attempts, max_attempts } = res.rows[0];

    if (attempts < max_attempts) {
      // Re-queue for retry with backoff
      await query(
        `UPDATE jobs
         SET status = 'pending',
             locked_by = null,
             error_message = $2
         WHERE id = $1`,
        [jobId, errorMessage]
      );
    } else {
      // Permanently failed
      await query(
        `UPDATE jobs
         SET status = 'failed',
             completed_at = NOW(),
             error_message = $2
         WHERE id = $1`,
        [jobId, errorMessage]
      );
    }
  }
}

export async function enqueueJob<T = any>(
  type: JobType,
  payload: T,
  priority: number = 0,
  maxAttempts: number = 3
): Promise<{ id: string }> {
  const id = await JobQueue.enqueue(type, payload, priority, maxAttempts);
  return { id };
}

