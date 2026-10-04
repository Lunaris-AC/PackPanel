-- PackPanel PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
    totp_secret TEXT,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    totp_recovery_codes TEXT[] DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_recovery_codes TEXT[] DEFAULT '{}';

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Endpoints
CREATE TABLE IF NOT EXISTS endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT DEFAULT '',
    cleanup_rules JSONB NOT NULL DEFAULT '["mods"]'::jsonb,
    auto_publish BOOLEAN NOT NULL DEFAULT FALSE,
    default_retention_days INT NOT NULL DEFAULT 14,
    min_retained_versions INT NOT NULL DEFAULT 5,
    quota_bytes BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Endpoint Permissions
CREATE TABLE IF NOT EXISTS user_endpoint_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    can_write BOOLEAN NOT NULL DEFAULT FALSE,
    can_publish BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, endpoint_id)
);

-- Content Addressed Objects (Deduplication store)
CREATE TABLE IF NOT EXISTS objects (
    sha256 VARCHAR(64) PRIMARY KEY,
    sha1 VARCHAR(40) NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    storage_rel_path TEXT NOT NULL,
    ref_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_objects_sha1 ON objects(sha1);

-- Releases / Versions
CREATE TABLE IF NOT EXISTS releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    release_id VARCHAR(64) NOT NULL,
    version_num INT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'preparing', 'published', 'archived', 'failed')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    manifest_content JSONB,
    total_files INT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,
    UNIQUE (endpoint_id, release_id),
    UNIQUE (endpoint_id, version_num)
);
CREATE INDEX IF NOT EXISTS idx_releases_endpoint_active ON releases(endpoint_id, is_active);

-- Files in a Release
CREATE TABLE IF NOT EXISTS release_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    sha256 VARCHAR(64) REFERENCES objects(sha256) ON DELETE RESTRICT,
    sha1 VARCHAR(40),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    is_dir BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (release_id, relative_path)
);
CREATE INDEX IF NOT EXISTS idx_release_files_release ON release_files(release_id);
CREATE INDEX IF NOT EXISTS idx_release_files_path ON release_files(relative_path);

-- Upload Sessions
CREATE TABLE IF NOT EXISTS upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('add_replace', 'full_replace')),
    source_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'uploading', 'sealed', 'processing', 'completed', 'failed', 'cancelled')),
    base_release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
    total_files INT NOT NULL DEFAULT 0,
    processed_files INT NOT NULL DEFAULT 0,
    failed_files INT NOT NULL DEFAULT 0,
    expected_files_count INT NOT NULL DEFAULT 0,
    received_files_count INT NOT NULL DEFAULT 0,
    total_bytes_expected BIGINT NOT NULL DEFAULT 0,
    total_bytes_received BIGINT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Files expected or uploaded within a session
CREATE TABLE IF NOT EXISTS upload_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
    tus_upload_id VARCHAR(128),
    relative_path TEXT NOT NULL,
    staging_path TEXT,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    expected_size BIGINT NOT NULL DEFAULT 0,
    received_size BIGINT NOT NULL DEFAULT 0,
    sha256 VARCHAR(64),
    sha1 VARCHAR(40),
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'staged', 'uploading', 'uploaded', 'hashing', 'verified', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, relative_path)
);
CREATE INDEX IF NOT EXISTS idx_upload_files_session ON upload_files(session_id);
CREATE INDEX IF NOT EXISTS idx_upload_files_tus ON upload_files(tus_upload_id);
-- CREATE TABLE IF NOT EXISTS cannot repair an older table missing this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS upload_files_session_id_relative_path_key ON upload_files(session_id, relative_path);

-- Persistent Job Queue
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    priority INT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    locked_by VARCHAR(128),
    heartbeat_at TIMESTAMPTZ,
    error_message TEXT,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority DESC, created_at ASC);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- File Change History with Undo capability
CREATE TABLE IF NOT EXISTS file_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
    release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'edit', 'delete', 'undo')),
    relative_path TEXT NOT NULL,
    previous_sha256 VARCHAR(64) REFERENCES objects(sha256) ON DELETE SET NULL,
    previous_sha1 VARCHAR(40),
    previous_size BIGINT DEFAULT 0,
    new_sha256 VARCHAR(64) REFERENCES objects(sha256) ON DELETE SET NULL,
    new_sha1 VARCHAR(40),
    new_size BIGINT DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_file_history_endpoint ON file_history(endpoint_id, created_at DESC);

-- Minecraft Instances (PackPanel V2)
CREATE TABLE IF NOT EXISTS instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint_id UUID REFERENCES endpoints(id) ON DELETE SET NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    icon_url TEXT,
    minecraft_version VARCHAR(32) NOT NULL,
    loader_type VARCHAR(20) NOT NULL CHECK (loader_type IN ('vanilla', 'forge', 'neoforge', 'fabric', 'quilt')),
    loader_version VARCHAR(64),
    java_version INT NOT NULL DEFAULT 17,
    java_args TEXT DEFAULT '-Xms2G -Xmx4G',
    server_address VARCHAR(255),
    server_name VARCHAR(128),
    file_policies JSONB NOT NULL DEFAULT '{"protected_paths": ["saves/", "screenshots/", "options.txt", "optionsof.txt", "usercache.json"], "optional_mods": []}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_instances_slug ON instances(slug);
CREATE INDEX IF NOT EXISTS idx_instances_endpoint ON instances(endpoint_id);

-- Custom Launcher Projects
CREATE TABLE IF NOT EXISTS launcher_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(128) NOT NULL,
    template VARCHAR(32) NOT NULL DEFAULT 'minimal' CHECK (template IN ('minimal', 'community', 'network')),
    accent_color VARCHAR(16) NOT NULL DEFAULT '#6366f1',
    background_url TEXT,
    logo_url TEXT,
    icon_url TEXT,
    auth_microsoft BOOLEAN NOT NULL DEFAULT FALSE,
    auth_offline BOOLEAN NOT NULL DEFAULT TRUE,
    discord_url TEXT,
    website_url TEXT,
    distribution_fqdn VARCHAR(255),
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_launcher_projects_slug ON launcher_projects(slug);
ALTER TABLE launcher_projects ALTER COLUMN auth_microsoft SET DEFAULT FALSE;

-- Launcher Project Instance Associations
CREATE TABLE IF NOT EXISTS launcher_project_instances (
    launcher_project_id UUID NOT NULL REFERENCES launcher_projects(id) ON DELETE CASCADE,
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (launcher_project_id, instance_id)
);

-- Launcher Builds
CREATE TABLE IF NOT EXISTS launcher_builds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    launcher_project_id UUID NOT NULL REFERENCES launcher_projects(id) ON DELETE CASCADE,
    version VARCHAR(32) NOT NULL,
    target_os VARCHAR(20) NOT NULL CHECK (target_os IN ('windows', 'linux', 'macos', 'all')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'completed', 'failed')),
    artifact_path TEXT,
    artifact_size BIGINT DEFAULT 0,
    artifact_sha256 VARCHAR(64),
    logs TEXT,
    error_message TEXT,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_launcher_builds_project ON launcher_builds(launcher_project_id, created_at DESC);

-- Instance-Centric V3 Enhancements
ALTER TABLE releases ADD COLUMN IF NOT EXISTS game_config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS launcher_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE instances ADD COLUMN IF NOT EXISTS launcher_project_id UUID REFERENCES launcher_projects(id) ON DELETE SET NULL;

