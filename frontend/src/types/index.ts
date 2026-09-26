export type Role = 'admin' | 'operator' | 'viewer';

export interface User {
  id: string;
  username: string;
  role: Role;
  totp_enabled?: boolean;
  created_at?: string;
  last_login_at?: string;
}

export interface UserEndpointPermission {
  endpoint_id: string;
  endpoint_slug: string;
  endpoint_name: string;
  can_write: boolean;
  can_publish: boolean;
}

export interface Endpoint {
  id: string;
  slug: string;
  name: string;
  description: string;
  cleanup_rules: string[];
  auto_publish: boolean;
  default_retention_days: number;
  min_retained_versions: number;
  quota_bytes: number;
  manifest_url: string;
  active_release_id?: string | null;
  active_version_num?: number | null;
  active_total_files?: number | null;
  active_total_bytes?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Release {
  id: string;
  release_id: string;
  version_num: number;
  status: 'draft' | 'building' | 'published' | 'archived';
  is_active: boolean;
  is_pinned: boolean;
  total_files: number;
  total_bytes: number;
  created_at: string;
  published_at?: string | null;
  created_by_username?: string;
  manifest_content?: any;
}

export interface ExplorerItem {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  sha1: string | false;
  sha256?: string | null;
}

export interface UploadSession {
  id: string;
  endpoint_id: string;
  user_id?: string;
  user_name?: string;
  mode: 'add_replace' | 'full_replace';
  source_type: 'manual' | 'zip' | 'folder' | 'watched';
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_files: number;
  processed_files: number;
  failed_files: number;
  created_at: string;
  updated_at: string;
}

export interface UploadFileRecord {
  id: string;
  relative_path: string;
  size_bytes: number;
  status: 'pending' | 'staged' | 'hashing' | 'verified' | 'failed';
  error_message?: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface DashboardStats {
  totalEndpoints: number;
  activeReleases: number;
  physicalObjects: number;
  physicalBytes: number;
  logicalBytes: number;
  savedBytes: number;
  deduplicationRatio: string;
  activeJobs: number;
  failedJobs24h: number;
  diskTotal: number;
  diskFree: number;
}

export interface AuditLogItem {
  id: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface FileHistoryItem {
  id: string;
  endpoint_id: string;
  release_id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  action: 'create' | 'edit' | 'delete' | 'undo';
  relative_path: string;
  previous_sha256?: string | null;
  previous_sha1?: string | null;
  previous_size?: number;
  new_sha256?: string | null;
  new_sha1?: string | null;
  new_size?: number;
  details?: any;
  created_at: string;
}

export type LoaderType = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt';

export interface MinecraftInstance {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  minecraft_version: string;
  loader_type: LoaderType;
  loader_version?: string;
  java_version: number;
  java_args?: string;
  server_address?: string;
  server_name?: string;
  file_policies?: any;
  endpoint_id?: string;
  endpoint_slug?: string;
  endpoint_name?: string;
  launcher_enabled?: boolean;
  launcher_project_id?: string;
  launcher_title?: string;
  launcher_template?: 'minimal' | 'community' | 'network';
  launcher_accent_color?: string;
  active_release_id?: string | null;
  active_total_files?: number | null;
  active_total_bytes?: number | null;
  manifest_url?: string | null;
  created_at: string;
  updated_at?: string;
  activeRelease?: Release | null;
  pendingChangesCount?: number;
  hasDraftConfigChanges?: boolean;
  launcher?: LauncherProjectWithBuilds | null;
}

export interface LauncherBuild {
  id: string;
  launcher_project_id: string;
  target_os: 'windows' | 'linux' | 'macos' | 'all';
  version: string;
  artifact_path?: string;
  artifact_size?: number;
  sha256?: string;
  status: 'pending' | 'building' | 'completed' | 'failed';
  error_message?: string;
  created_by_username?: string;
  created_at: string;
  completed_at?: string;
}

export interface LauncherProjectWithBuilds {
  id: string;
  name: string;
  slug: string;
  title: string;
  template: 'minimal' | 'community' | 'network';
  accent_color: string;
  background_url?: string;
  logo_url?: string;
  icon_url?: string;
  auth_microsoft: boolean;
  auth_offline: boolean;
  discord_url?: string;
  website_url?: string;
  builds?: LauncherBuild[];
}

export interface MinecraftVersionSummary {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
}

export interface LoaderCompatibilitySummary {
  loader: LoaderType;
  supported: boolean;
  recommendedVersion?: string;
  latestVersion?: string;
}

export interface LoaderVersionEntry {
  version: string;
  stable: boolean;
}

export interface JavaRequirement {
  majorVersion: number;
  jvmArgs: string[];
}

