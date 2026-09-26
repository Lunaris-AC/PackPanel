import { catalogCache } from '../cache';
import { LoaderVersionEntry } from '../types';

const FORGE_PROMOS_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_MAVEN_META_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const TIMEOUT_MS = 8000;

interface ForgePromosResponse {
  promos: Record<string, string>;
}

export async function fetchForgePromos(): Promise<Record<string, string>> {
  const result = await catalogCache.getOrFetch(
    'forge_promotions_slim',
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(FORGE_PROMOS_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ForgePromosResponse;
        return data.promos;
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  return result.data;
}

export async function isForgeAvailableForMinecraft(mcVersion: string): Promise<boolean> {
  const promos = await fetchForgePromos();
  return Boolean(promos[`${mcVersion}-latest`] || promos[`${mcVersion}-recommended`]);
}

export async function fetchForgeLoaderVersions(mcVersion: string): Promise<LoaderVersionEntry[]> {
  const promos = await fetchForgePromos();
  const recommended = promos[`${mcVersion}-recommended`];
  const latest = promos[`${mcVersion}-latest`];

  const versionsSet = new Set<string>();
  if (recommended) versionsSet.add(recommended);
  if (latest) versionsSet.add(latest);

  // Try to supplement with maven metadata if available
  try {
    const mavenResult = await catalogCache.getOrFetch(
      'forge_maven_versions',
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const res = await fetch(FORGE_MAVEN_META_URL, { signal: controller.signal });
          if (!res.ok) return [];
          const xml = await res.text();
          const list: string[] = [];
          const regex = /<version>([^<]+)<\/version>/g;
          let match;
          while ((match = regex.exec(xml)) !== null) {
            list.push(match[1]);
          }
          return list;
        } finally {
          clearTimeout(timer);
        }
      },
      { ttlMs: 24 * 60 * 60 * 1000 } // 24 hours
    );

    const prefix = `${mcVersion}-`;
    for (const v of mavenResult.data) {
      if (v.startsWith(prefix)) {
        const forgeVer = v.substring(prefix.length);
        versionsSet.add(forgeVer);
      }
    }
  } catch (e) {
    // If maven metadata fails, promos is our authoritative fallback
  }

  const list = Array.from(versionsSet);
  // Sort versions descending
  list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

  return list.map(v => ({
    version: v,
    stable: v === recommended || (!v.includes('beta') && !v.includes('rc')),
    isRecommended: v === recommended || (recommended === undefined && v === latest)
  }));
}
