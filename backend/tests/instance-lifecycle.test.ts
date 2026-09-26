import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { validateCombination, resolveJavaRequirement } from '../src/catalog';
import { buildLauncherArtifact } from '../src/build/launcher-builder';
import * as db from '../src/db';

describe('Instance-Centric Architecture & Catalog Tests', () => {
  it('validates NeoForge 1.21.1 with Java 21 requirement', async () => {
    const result = await validateCombination('1.21.1', 'neoforge');
    expect(result.valid).toBe(true);
    expect(result.javaRequirement.majorVersion).toBe(21);
    expect(result.resolvedLoaderVersion).toBeDefined();
  });

  it('validates Fabric 1.20.1 with Java 17 requirement', async () => {
    const result = await validateCombination('1.20.1', 'fabric');
    expect(result.valid).toBe(true);
    expect(result.javaRequirement.majorVersion).toBe(17);
  });

  it('validates Vanilla 1.16.5 with Java 8 requirement', async () => {
    const result = await validateCombination('1.16.5', 'vanilla');
    expect(result.valid).toBe(true);
    expect(result.javaRequirement.majorVersion).toBe(8);
  });

  it('rejects invalid loader version or unsupported combination gracefully', async () => {
    const result = await validateCombination('1.7.10', 'neoforge');
    expect(result.valid).toBe(false);
    expect(result.error?.toLowerCase()).toContain('neoforge');
  });

  it('correctly resolves Java requirements for edge versions', async () => {
    const req1204 = await resolveJavaRequirement('1.20.4');
    expect(req1204.majorVersion).toBe(17);

    const req1205 = await resolveJavaRequirement('1.20.5');
    expect(req1205.majorVersion).toBe(21);

    const req117 = await resolveJavaRequirement('1.17');
    expect(req117.majorVersion).toBe(16);

    const req116 = await resolveJavaRequirement('1.16.5');
    expect(req116.majorVersion).toBe(8);
  });

  it('buildLauncherArtifact produces a valid standalone package with checksums', async () => {
    const mockProjectId = crypto.randomUUID();
    const mockBuildId = crypto.randomUUID();

    // Mock db queries for builder
    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT COUNT(*)')) {
        return { rows: [{ count: '0' }] } as any;
      }
      if (sql.includes('SELECT * FROM launcher_projects')) {
        return {
          rows: [{
            id: mockProjectId,
            name: 'Inferi Test Modpack',
            slug: 'inferi-test',
            title: 'Inferi Launcher',
            template: 'community',
            accent_color: '#6366f1',
            auth_microsoft: true,
            auth_offline: true,
            distribution_fqdn: 'mccdn.inferi.fr'
          }]
        } as any;
      }
      if (sql.includes('SELECT i.*, lpi.is_default')) {
        return {
          rows: [{
            id: crypto.randomUUID(),
            name: 'Survie 1.21',
            slug: 'survie-1-21',
            minecraft_version: '1.21.1',
            loader_type: 'fabric',
            loader_version: '0.16.5',
            java_version: 21,
            endpoint_slug: 'survie-1-21',
            is_default: true
          }]
        } as any;
      }
      if (sql.includes('INSERT INTO launcher_builds')) {
        return {
          rows: [{
            id: mockBuildId,
            launcher_project_id: mockProjectId,
            target_os: params?.[1] || 'windows',
            version: params?.[2] || '1.0.0',
            status: 'building'
          }]
        } as any;
      }
      if (sql.includes('UPDATE launcher_builds')) {
        return { rows: [] } as any;
      }
      return { rows: [] } as any;
    });

    const build = await buildLauncherArtifact({
      launcherProjectId: mockProjectId,
      targetOs: 'windows'
    });

    expect(build.buildId).toBe(mockBuildId);
    expect(build.artifactSha256).toBeDefined();
    expect(build.artifactSha256).toHaveLength(64);
    expect(build.artifactSize).toBeGreaterThan(0);
    expect(fs.existsSync(build.artifactPath)).toBe(true);

    // Verify zip contents without throwing
    const zipBytes = fs.readFileSync(build.artifactPath);
    expect(zipBytes.subarray(0, 4).toString('hex')).toBe('504b0304'); // PK zip magic

    // Cleanup temp artifact
    if (fs.existsSync(build.artifactPath)) {
      fs.unlinkSync(build.artifactPath);
    }
  });
});
