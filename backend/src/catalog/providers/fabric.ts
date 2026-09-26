import { catalogCache } from '../cache';
import { LoaderVersionEntry } from '../types';

const FABRIC_META_BASE = 'https://meta.fabricmc.net/v2';
const TIMEOUT_MS = 6000;

interface FabricGameVersion {
  version: string;
  stable: boolean;
}

interface FabricLoaderVersion {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
    stable: boolean;
  };
}

export async function isFabricAvailableForMinecraft(mcVersion: string): Promise<boolean> {
  const result = await catalogCache.getOrFetch(
    'fabric_game_versions',
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${FABRIC_META_BASE}/versions/game`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as FabricGameVersion[];
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  return result.data.some(v => v.version === mcVersion);
}

export async function fetchFabricLoaderVersions(mcVersion: string): Promise<LoaderVersionEntry[]> {
  const key = `fabric_loaders_${mcVersion}`;
  const result = await catalogCache.getOrFetch(
    key,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${FABRIC_META_BASE}/versions/loader/${encodeURIComponent(mcVersion)}`, {
          signal: controller.signal
        });
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as FabricLoaderVersion[];
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  const entries: LoaderVersionEntry[] = result.data.map((item, idx) => ({
    version: item.loader.version,
    stable: item.loader.stable,
    buildNumber: item.loader.build,
    isRecommended: idx === 0 || item.loader.stable
  }));

  // Ensure only the very first stable (or first entry) has isRecommended: true
  const firstStableIdx = entries.findIndex(e => e.stable);
  entries.forEach((e, idx) => {
    e.isRecommended = firstStableIdx >= 0 ? idx === firstStableIdx : idx === 0;
  });

  return entries;
}
