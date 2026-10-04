export * from '@packpanel/protocol';
export * from '@packpanel/engine';

import {
  InstanceManifestV2,
  LauncherConfigV2,
  AuthProfile
} from '@packpanel/protocol';
import {
  MinecraftEngine,
  createOfflineProfile,
  MicrosoftAuthenticator
} from '@packpanel/engine';

export interface PackPanelClientOptions {
  baseUrl: string;
  apiToken?: string;
}

export class PackPanelApiClient {
  private baseUrl: string;
  private apiToken?: string;

  constructor(options: PackPanelClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiToken = options.apiToken;
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(this.apiToken ? { 'Authorization': `Bearer ${this.apiToken}` } : {})
    };

    const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers as any) } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `Erreur requête PackPanel API HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Fetches launcher configuration from the authenticated administrative API
   */
  async getLauncherConfig(launcherIdOrSlug: string): Promise<LauncherConfigV2> {
    return this.request<LauncherConfigV2>(`/api/v2/launchers/${launcherIdOrSlug}/config`);
  }

  /**
   * Fetches the V2 instance manifest from the authenticated administrative API
   */
  async getInstanceManifest(instanceIdOrSlug: string): Promise<InstanceManifestV2> {
    return this.request<InstanceManifestV2>(`/api/v2/instances/${instanceIdOrSlug}/manifest`);
  }

  /**
   * Checks API health
   */
  async getHealth(): Promise<{ status: string; version: string }> {
    return this.request<{ status: string; version: string }>('/api/health');
  }
}

/**
 * High-level helper to easily bootstrap the engine for a launcher application
 */
export function createLauncherEngine(gameDirectory: string): MinecraftEngine {
  return new MinecraftEngine({ baseDir: gameDirectory });
}
