import { describe, it, expect, beforeEach } from 'vitest';
import { resolveJavaRequirement, getNeoForgePrefixForMinecraft } from '../src/catalog';
import { catalogCache } from '../src/catalog/cache';

describe('Version Catalog & Java Requirement Resolver', () => {
  beforeEach(() => {
    catalogCache.clear();
  });

  describe('Historical Java requirements fallback rules', () => {
    it('resolves Java 8 for Minecraft <= 1.16.5', async () => {
      const res112 = await resolveJavaRequirement('1.12.2', 'forge');
      expect(res112.majorVersion).toBe(8);

      const res116 = await resolveJavaRequirement('1.16.5', 'fabric');
      expect(res116.majorVersion).toBe(8);
    });

    it('resolves Java 16 for Minecraft 1.17', async () => {
      const res117 = await resolveJavaRequirement('1.17.1', 'vanilla');
      expect(res117.majorVersion).toBe(16);
    });

    it('resolves Java 17 for Minecraft 1.18 through 1.20.4', async () => {
      const res118 = await resolveJavaRequirement('1.18.2', 'fabric');
      expect(res118.majorVersion).toBe(17);

      const res1201 = await resolveJavaRequirement('1.20.1', 'fabric');
      expect(res1201.majorVersion).toBe(17);

      const res1204 = await resolveJavaRequirement('1.20.4', 'neoforge');
      expect(res1204.majorVersion).toBe(17);
    });

    it('resolves Java 21 for Minecraft >= 1.20.5 and 1.21+', async () => {
      const res1205 = await resolveJavaRequirement('1.20.5', 'vanilla');
      expect(res1205.majorVersion).toBe(21);

      const res121 = await resolveJavaRequirement('1.21.1', 'fabric');
      expect(res121.majorVersion).toBe(21);
    });

    it('forces Java 21 on NeoForge 20.5+ and 21+', async () => {
      const res = await resolveJavaRequirement('1.20.4', 'neoforge', '20.5.12');
      expect(res.majorVersion).toBe(21);
      expect(res.source).toBe('loader_constraint');
    });
  });

  describe('NeoForge prefix parser', () => {
    it('correctly maps MC version to NeoForge prefix', () => {
      expect(getNeoForgePrefixForMinecraft('1.20.1')).toBe('20.1.');
      expect(getNeoForgePrefixForMinecraft('1.20.4')).toBe('20.4.');
      expect(getNeoForgePrefixForMinecraft('1.21.1')).toBe('21.1.');
      expect(getNeoForgePrefixForMinecraft('1.19.4')).toBeNull(); // NeoForge did not exist before 1.20.1
    });
  });

  describe('Catalog Cache in-flight deduplication', () => {
    it('caches and deduplicates concurrent fetches', async () => {
      let callCount = 0;
      const fetcher = async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 10));
        return { data: 'test_catalog' };
      };

      const [r1, r2, r3] = await Promise.all([
        catalogCache.getOrFetch('test_key', fetcher),
        catalogCache.getOrFetch('test_key', fetcher),
        catalogCache.getOrFetch('test_key', fetcher)
      ]);

      expect(callCount).toBe(1);
      expect(r1.data).toEqual({ data: 'test_catalog' });
      expect(r2.data).toEqual({ data: 'test_catalog' });
      expect(r3.data).toEqual({ data: 'test_catalog' });
    });
  });
});
