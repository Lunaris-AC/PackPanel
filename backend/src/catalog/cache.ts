import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';

const CATALOG_CACHE_DIR = path.join(DATA_DIR, 'cache', 'catalog');

interface CacheOptions {
  ttlMs?: number;
}

export class CatalogCache {
  private memoryCache = new Map<string, { data: any; expiresAt: number; savedAt: number }>();
  private inFlight = new Map<string, Promise<any>>();

  constructor() {
    try {
      if (!fs.existsSync(CATALOG_CACHE_DIR)) {
        fs.mkdirSync(CATALOG_CACHE_DIR, { recursive: true, mode: 0o755 });
      }
    } catch (e) {
      // Fallback to memory only if filesystem cache is unavailable
    }
  }

  private getDiskPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(CATALOG_CACHE_DIR, `${safeKey}.json`);
  }

  public async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<{ data: T; isStale: boolean; cachedAt: number }> {
    const ttlMs = options.ttlMs ?? 60 * 60 * 1000; // 1 hour default
    const now = Date.now();

    // 1. Check in-memory cache
    const mem = this.memoryCache.get(key);
    if (mem && mem.expiresAt > now) {
      return { data: mem.data, isStale: false, cachedAt: mem.savedAt };
    }

    // 2. Check disk cache
    let diskData: T | null = null;
    let diskSavedAt = 0;
    const diskPath = this.getDiskPath(key);

    try {
      if (fs.existsSync(diskPath)) {
        const raw = fs.readFileSync(diskPath, 'utf8');
        const parsed = JSON.parse(raw);
        diskSavedAt = parsed.savedAt || 0;
        diskData = parsed.data;

        if (now - diskSavedAt < ttlMs && diskData !== null) {
          this.memoryCache.set(key, { data: diskData, expiresAt: diskSavedAt + ttlMs, savedAt: diskSavedAt });
          return { data: diskData, isStale: false, cachedAt: diskSavedAt };
        }
      }
    } catch (e) {
      // Ignore disk read error and proceed to fetch
    }

    // 3. Deduplicate in-flight fetch
    if (this.inFlight.has(key)) {
      const result = await this.inFlight.get(key)!;
      return { data: result, isStale: false, cachedAt: Date.now() };
    }

    const fetchPromise = (async () => {
      try {
        const fresh = await fetcher();
        const savedAt = Date.now();

        // Save in memory
        this.memoryCache.set(key, { data: fresh, expiresAt: savedAt + ttlMs, savedAt });

        // Save to disk
        try {
          fs.writeFileSync(diskPath, JSON.stringify({ data: fresh, savedAt }, null, 2), 'utf8');
        } catch (e) {
          // Ignore disk write errors
        }

        return fresh;
      } catch (err) {
        // If network/upstream error and we have any disk data, return stale cache!
        if (diskData !== null) {
          console.warn(`[CatalogCache] Upstream fetch failed for ${key}, using stale cached copy:`, (err as any)?.message);
          return diskData;
        }
        throw err;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, fetchPromise);
    const result = await fetchPromise;
    const isStale = diskData !== null && result === diskData;
    return { data: result, isStale, cachedAt: diskSavedAt || Date.now() };
  }

  public clear(): void {
    this.memoryCache.clear();
    try {
      if (fs.existsSync(CATALOG_CACHE_DIR)) {
        const files = fs.readdirSync(CATALOG_CACHE_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(CATALOG_CACHE_DIR, file));
        }
      }
    } catch (e) {
      // Ignore
    }
  }
}

export const catalogCache = new CatalogCache();
