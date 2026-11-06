import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
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
  it('applies explicit optional choices without touching protected player files', async () => {
    const bytes = 'fixture';
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    const optional = { path: 'mods/optional.jar', policy: 'optional', url: 'https://example.com/mod.jar', size: bytes.length, sha1 };
    const player = { ...optional, path: 'options.txt' };
    const pack = manifest([optional, player]);
    const synchronizer = new InstanceSynchronizer(dir);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes)));
    fs.writeFileSync(path.join(dir, 'options.txt'), 'my settings');
    expect(synchronizer.listOptionalFiles(pack)).toEqual([{ path: optional.path, enabled: false }]);
    await synchronizer.sync(pack, undefined, 4, { optionalFiles: { [optional.path]: true } });
    expect(fs.readFileSync(path.join(dir, optional.path), 'utf8')).toBe(bytes);
    await synchronizer.sync(pack, undefined, 4, { optionalFiles: { [optional.path]: false, [player.path]: false } });
    expect(fs.existsSync(path.join(dir, optional.path))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'options.txt'), 'utf8')).toBe('my settings');
  });
  it('cancels all pack transfers and leaves player files intact', async () => {
    const files = ['a.jar', 'b.jar'].map(name => ({ path: 'mods/' + name, policy: 'required',
      url: 'https://example.com/' + name, size: 3, sha1: '0'.repeat(40) }));
    const controller = new AbortController();
    const stopped: string[] = [];
    const fetch = vi.fn((url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => { stopped.push(url); reject(options.signal!.reason); }, { once: true });
      if (fetch.mock.calls.length === 2) queueMicrotask(() => controller.abort(new Error('cancelled')));
    }));
    vi.stubGlobal('fetch', fetch);
    fs.mkdirSync(path.join(dir, 'mods'));
    fs.writeFileSync(path.join(dir, 'mods', 'old.jar'), 'original');
    await expect(new InstanceSynchronizer(dir).sync(manifest(files), undefined, 4, { signal: controller.signal })).rejects.toThrow('cancelled');
    expect(stopped).toHaveLength(2);
    expect(fs.readdirSync(path.join(dir, 'mods'))).toEqual(['old.jar']);
  });
});
