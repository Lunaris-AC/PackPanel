ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type VARCHAR(64);
UPDATE jobs SET job_type = type WHERE job_type IS NULL;
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
