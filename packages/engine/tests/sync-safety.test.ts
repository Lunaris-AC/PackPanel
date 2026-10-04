import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceSynchronizer } from '../src/sync/synchronizer';
import type { InstanceManifestV2 } from '@packpanel/protocol';

describe('Player files and unsafe distribution manifests', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packpanel-sync-test-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });
  const manifest = (files: any[], cleanupRules: string[] = ['mods']): InstanceManifestV2 => ({ formatVersion: 2, instanceId: '00000000-0000-0000-0000-000000000000', instanceName: 'Test', slug: 'test', minecraftVersion: '1.21.1', loader: { type: 'fabric' }, java: { majorVersion: 21 }, files, protectedPaths: [], cleanupRules, updatedAt: new Date().toISOString() });
  it('rejects traversal before making a download or cleanup', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(new InstanceSynchronizer(dir).sync(manifest([{ path: '../escape.txt' }]))).rejects.toThrow();
    await expect(new InstanceSynchronizer(dir).sync(manifest([], ['..']))).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves player saves and options even if the manifest removes its protected paths', async () => {
    fs.mkdirSync(path.join(dir, 'saves', 'world'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'saves', 'world', 'level.dat'), 'world');
    fs.writeFileSync(path.join(dir, 'options.txt'), 'settings');
    await new InstanceSynchronizer(dir).sync(manifest([{ path: 'options.txt' }], ['saves']));
    expect(fs.readFileSync(path.join(dir, 'saves', 'world', 'level.dat'), 'utf8')).toBe('world');
    expect(fs.readFileSync(path.join(dir, 'options.txt'), 'utf8')).toBe('settings');
  });
  it('does not install a disabled optional mod and removes an obsolete required mod', async () => {
    fs.mkdirSync(path.join(dir, 'mods')); fs.writeFileSync(path.join(dir, 'mods', 'obsolete.jar'), 'old');
    await new InstanceSynchronizer(dir).sync(manifest([{ path: 'mods/optional.jar', policy: 'default_off' }]));
    expect(fs.readdirSync(path.join(dir, 'mods'))).toEqual([]);
  });
});
