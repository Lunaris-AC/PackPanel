import { catalogCache } from '../cache';
import { LoaderVersionEntry } from '../types';

const NEOFORGE_MAVEN_META_URL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
const TIMEOUT_MS = 8000;

export function getNeoForgePrefixForMinecraft(mcVersion: string): string | null {
  // NeoForge 1.20.1 uses the legacy net.neoforged:forge artifact.
  if (mcVersion === '1.20.1') return null;
  const modern = mcVersion.match(/^(\d{2})\.(\d+)(?:\.\d+)?$/);
  if (modern) return `${modern[1]}.${modern[2]}.`;
  const match = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  const minor = match[2] ? parseInt(match[2], 10) : 0;

  if (major < 20) return null; // NeoForge started at 1.20.1
  return `${major}.${minor}.`;
}

export async function fetchAllNeoForgeVersions(): Promise<string[]> {
  const result = await catalogCache.getOrFetch(
    'neoforge_maven_versions',
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(NEOFORGE_MAVEN_META_URL, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const versions: string[] = [];
        const regex = /<version>([^<]+)<\/version>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          versions.push(match[1]);
        }
        return versions;
      } finally {
        clearTimeout(timer);
      }
    },
    { ttlMs: 60 * 60 * 1000 }
  );

  return result.data;
}

export async function isNeoForgeAvailableForMinecraft(mcVersion: string): Promise<boolean> {
  const prefix = getNeoForgePrefixForMinecraft(mcVersion);
  if (!prefix) return false;

  const allVersions = await fetchAllNeoForgeVersions();
  return allVersions.some(v => v.startsWith(prefix));
}

export async function fetchNeoForgeLoaderVersions(mcVersion: string): Promise<LoaderVersionEntry[]> {
  const prefix = getNeoForgePrefixForMinecraft(mcVersion);
  if (!prefix) return [];

  const allVersions = await fetchAllNeoForgeVersions();
  const matching = allVersions.filter(v => v.startsWith(prefix));

  matching.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  const entries: LoaderVersionEntry[] = matching.map((v, idx) => ({
    version: v,
    stable: !v.includes('beta') && !v.includes('alpha'),
    isRecommended: false
  }));
  const recommended = entries.find(e => e.stable) || entries[0];
  if (recommended) recommended.isRecommended = true;

  return entries;
}
