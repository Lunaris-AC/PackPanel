ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS total_files INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS processed_files INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS failed_files INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '24 hours');
ALTER TABLE upload_sessions DROP CONSTRAINT IF EXISTS upload_sessions_status_check;
ALTER TABLE upload_sessions ADD CONSTRAINT upload_sessions_status_check CHECK (status IN ('open', 'uploading', 'sealed', 'processing', 'completed', 'failed', 'cancelled'));

ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS staging_path TEXT;
ALTER TABLE upload_files ADD COLUMN IF NOT EXISTS size_bytes BIGINT NOT NULL DEFAULT 0;
ALTER TABLE upload_files DROP CONSTRAINT IF EXISTS upload_files_status_check;
ALTER TABLE upload_files ADD CONSTRAINT upload_files_status_check CHECK (status IN ('pending', 'staged', 'uploading', 'uploaded', 'hashing', 'verified', 'failed'));
