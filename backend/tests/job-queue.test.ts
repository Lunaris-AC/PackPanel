import { describe, expect, it, vi } from 'vitest';
import { JobQueue } from '../src/jobs/queue';
import * as db from '../src/db';

describe('Persistent worker queue', () => {
  it('dispatches the job_type stored by PostgreSQL', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce({ rows: [{ id: 'job', job_type: 'process_upload_file', payload: { sessionId: 'session' } }] } as any);
    const job = await JobQueue.fetchNext('worker');
    expect(job?.type).toBe('process_upload_file');
    expect(job?.payload).toEqual({ sessionId: 'session' });
  });
});
