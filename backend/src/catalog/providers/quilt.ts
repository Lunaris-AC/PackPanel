import { catalogCache } from '../cache';
import { LoaderVersionEntry } from '../types';

const QUILT_META_BASE = 'https://meta.quiltmc.org/v3';
const TIMEOUT_MS = 6000;

interface QuiltGameVersion {
  version: string;
  stable: boolean;
}

interface QuiltLoaderVersion {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
  };
}

export async function isQuiltAvailableForMinecraft(mcVersion: string): Promise<boolean> {
  const result = await catalogCache.getOrFetch(
    'quilt_game_versions',
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${QUILT_META_BASE}/versions/game`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as QuiltGameVersion[];
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  return result.data.some(v => v.version === mcVersion);
}

export async function fetchQuiltLoaderVersions(mcVersion: string): Promise<LoaderVersionEntry[]> {
  const key = `quilt_loaders_${mcVersion}`;
  const result = await catalogCache.getOrFetch(
    key,
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`${QUILT_META_BASE}/versions/loader/${encodeURIComponent(mcVersion)}`, {
          signal: controller.signal
        });
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as QuiltLoaderVersion[];
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  const entries: LoaderVersionEntry[] = result.data.map((item, idx) => ({
    version: item.loader.version,
    stable: !/alpha|beta|rc/i.test(item.loader.version),
    buildNumber: item.loader.build,
    isRecommended: idx === 0
  }));
  const recommended = entries.find(e => e.stable) || entries[0];
  entries.forEach(e => { e.isRecommended = e === recommended; });

  return entries;
}
