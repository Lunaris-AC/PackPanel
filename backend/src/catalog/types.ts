export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'neoforge' | 'forge';

export type SupportState = 'upstream_available' | 'engine_supported' | 'engine_tested';

export interface MinecraftVersionSummary {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  releaseTime: string;
  url: string;
  isLatestRelease?: boolean;
  isLatestSnapshot?: boolean;
}

export interface LoaderCompatibilitySummary {
  loader: LoaderType;
  displayName: string;
  available: boolean;
  error?: string;
  supportState: SupportState;
  recommendedVersion?: string;
  latestVersion?: string;
  notes?: string;
}

export interface LoaderVersionEntry {
  version: string;
  stable: boolean;
  isRecommended?: boolean;
  buildNumber?: number;
}

export interface JavaRequirement {
  majorVersion: number;
  recommendedMemoryMb: number;
  jvmArgs: string[];
  source: 'mojang_manifest' | 'loader_constraint' | 'legacy_heuristic';
}

export interface CatalogCacheEntry<T> {
  timestamp: number;
  data: T;
  stale?: boolean;
}
