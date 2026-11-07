import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerCloud } from '../src/main/player-cloud';

const instance = { id: '22222222-2222-4222-8222-222222222222', manifestUrl: 'https://cdn.example.test/pack/packpanel.json' };
const option = 'options.txt';
let root: string;
let fetchMock: ReturnType<typeof vi.fn>;
let remote: Map<string, { revision: number; payload: string }>;

function device(name: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  let local = '';
  const cloud = new PlayerCloud(instance, () => local, value => { local = value; });
  return { cloud, dir, file: path.join(dir, option) };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'packpanel-cloud-'));
  remote = new Map();
  fetchMock = vi.fn(async (url: string, request: RequestInit) => {
    const owner = (request.headers as Record<string, string>).Authorization;
    if (!url.endsWith('/options')) return Response.json({ backupEnabled: true });
    const current = remote.get(owner);
    if (request.method === 'GET') return Response.json(current ?? { revision: 0 });
    const next = JSON.parse(request.body as string);
    if (next.revision !== (current?.revision ?? 0)) return new Response(null, { status: 409 });
    remote.set(owner, { revision: next.revision + 1, payload: next.payload });
    return Response.json({ revision: next.revision + 1 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('Player options and diagnostics', () => {
  it('encrypts options, isolates players and restores them with the recovery key', async () => {
    const first = device('first');
    await first.cloud.configureBackup();
    const key = first.cloud.copyKey()!;
    const save = await first.cloud.prepareOptions(first.dir);
    fs.writeFileSync(first.file, 'gamma:0.35');
    await save!();

    const [[authorization, stored]] = [...remote];
    expect(authorization).not.toContain(key);
    expect(Buffer.from(stored.payload, 'base64url').includes(Buffer.from('gamma:0.35'))).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://cdn.example.test/player-services/${instance.id}`);
    const second = device('second');
    await expect(second.cloud.configureBackup(randomBytes(32).toString('base64url'))).rejects.toThrow('not found');
    await second.cloud.configureBackup(key);
    await second.cloud.prepareOptions(second.dir);
    expect(fs.readFileSync(second.file, 'utf8')).toBe('gamma:0.35');
  });

  it('rejects overwrites when another device saves first', async () => {
    const first = device('first');
    await first.cloud.configureBackup();
    fs.writeFileSync(first.file, 'gamma:0.35');
    await (await first.cloud.prepareOptions(first.dir))!();
    const second = device('second');
    await second.cloud.configureBackup(first.cloud.copyKey());
    const saveFirst = await first.cloud.prepareOptions(first.dir);
    const saveSecond = await second.cloud.prepareOptions(second.dir);
    fs.writeFileSync(first.file, 'gamma:0.45');
    fs.writeFileSync(second.file, 'gamma:0.60');
    await saveFirst!();
    await expect(saveSecond!()).rejects.toThrow('Could not save');
    await expect(second.cloud.prepareOptions(second.dir)).rejects.toThrow('two devices');
    expect(fs.readFileSync(second.file, 'utf8')).toBe('gamma:0.60');
  });

  it('sends diagnostics by default and honors the local opt-out', async () => {
    const { cloud } = device('first');
    const report = { id: randomUUID(), player: 'Player', exitCode: 1, log: 'Game failed' };
    await cloud.sendLog(report);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/game-logs$/), expect.objectContaining({ method: 'POST' }));
    cloud.setShareLogs(false);
    await cloud.sendLog(report);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
