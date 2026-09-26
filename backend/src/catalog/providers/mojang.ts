import { catalogCache } from '../cache';
import { MinecraftVersionSummary } from '../types';

const MOJANG_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const TIMEOUT_MS = 8000;

interface MojangManifestResponse {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: Array<{
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    time: string;
    releaseTime: string;
    sha1: string;
    complianceLevel: number;
  }>;
}

export async function fetchMojangVersions(): Promise<{
  versions: MinecraftVersionSummary[];
  latestRelease: string;
  latestSnapshot: string;
}> {
  const result = await catalogCache.getOrFetch(
    'mojang_version_manifest',
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(MOJANG_MANIFEST_URL, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Mojang API error: HTTP ${res.status}`);
        }
        const data = (await res.json()) as MojangManifestResponse;
        return data;
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 30 * 60 * 1000 } // 30 minutes
  );

  const raw = result.data;
  const versions: MinecraftVersionSummary[] = raw.versions.map(v => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime,
    url: v.url,
    isLatestRelease: v.id === raw.latest.release,
    isLatestSnapshot: v.id === raw.latest.snapshot
  }));

  return {
    versions,
    latestRelease: raw.latest.release,
    latestSnapshot: raw.latest.snapshot
  };
}

export async function fetchMojangVersionDetail(url: string, versionId: string): Promise<any> {
  const key = `mojang_version_detail_${versionId}`;
  const result = await catalogCache.getOrFetch(
    key,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 7 * 24 * 60 * 60 * 1000 } // 7 days (version packages are immutable)
  );

  return result.data;
}
