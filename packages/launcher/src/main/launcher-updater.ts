import nodeFs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openPromise } from 'yauzl';
import { computeFileHashes, downloadFile, resolveSafePath } from '@packpanel/engine';
import { LauncherRuntimeSchema, verifyLauncherRuntime, type LauncherRuntime, type LauncherRuntimeRelease } from '@packpanel/protocol/launcher-update';
import { startWindowsUpgrade } from './windows-upgrade';

// Runtime archives contain .asar files, which Electron otherwise treats as directories.
const fs: typeof nodeFs = process.versions.electron ? require('original-fs') : nodeFs;

export type LauncherUpdateState = { state: 'idle' | 'ready' | 'failed' } | { state: 'downloading'; percent: number };

export function installedWindowsRoot(instanceId: string, executable: string): string | undefined {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA || !/^[a-f0-9-]{36}$/i.test(instanceId)) return;
  const root = path.join(process.env.LOCALAPPDATA, 'Programs', 'PackPanel', instanceId);
  if (path.resolve(executable).toLowerCase() === path.join(root, 'app', 'PackPanel.exe').toLowerCase() &&
      fs.existsSync(path.join(root, 'PackPanelStart.exe'))) return root;

  const cached = path.dirname(path.dirname(path.resolve(executable)));
  const cacheParent = path.join(process.env.LOCALAPPDATA, 'PackPanel', 'Runtime', instanceId);
  if (path.dirname(cached).toLowerCase() === cacheParent.toLowerCase() &&
      /^[a-f0-9-]{36}$/i.test(path.basename(cached)) &&
      path.resolve(executable).toLowerCase() === path.join(cached, 'app', 'PackPanel.exe').toLowerCase() &&
      fs.existsSync(path.join(cached, 'ready'))) return cached;
}

async function readEnvelope(feed: string): Promise<unknown> {
  const response = await fetch(feed, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error(`Launcher update feed: HTTP ${response.status}`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(response.body as any)) {
    size += chunk.length;
    if (size > 4096) throw new Error('Launcher update feed is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function downloadLauncherUpgrade(root: string, report: (state: LauncherUpdateState) => void) {
  const appRoot = path.join(root, 'app', 'resources', 'app');
  const installed = LauncherRuntimeSchema.parse(JSON.parse(await fs.promises.readFile(path.join(appRoot, 'launcher-runtime.json'), 'utf8')));
  const release = verifyLauncherRuntime(await readEnvelope(installed.feed), installed.publicKey);
  if (release.sequence <= installed.sequence || release.revision === installed.revision) return;
  const failed = await fs.promises.readFile(path.join(root, 'upgrade.failed'), 'utf8').catch(() => '');
  if (failed.trim() === String(release.sequence)) throw new Error('This launcher version previously failed to start');
  const archive = path.join(root, 'upgrade-cache', 'windows.zip');
  let percent = -1;
  await downloadFile(new URL(`${release.sha256}.zip`, installed.feed).href, archive, {
    expectedSize: release.bytes, expectedSha256: release.sha256, maxRetries: 2, redirect: 'error',
    onProgress: done => {
      const next = Math.floor(100 * done / release.bytes);
      if (next !== percent) { percent = next; report({ state: 'downloading', percent }); }
    }
  });
  return { archive, release, installed };
}

export async function installLauncherUpgrade(root: string, instanceId: string, userData: string, update: {
  archive: string; release: LauncherRuntimeRelease; installed: LauncherRuntime;
}): Promise<void> {
  if (fs.existsSync(path.join(root, 'upgrade.pending'))) throw new Error('A launcher update is already pending');
  const hash = await computeFileHashes(update.archive);
  if (hash.size !== update.release.bytes || hash.sha256 !== update.release.sha256) throw new Error('Launcher update archive has changed');
  const work = await fs.promises.mkdtemp(path.join(root, 'upgrade-'));
  try {
    const nextApp = path.join(work, 'app');
    const destinations = new Set<string>();
    const archive = await openPromise(update.archive, { lazyEntries: true });
    let extractedBytes = 0;
    try {
      for await (const entry of archive.eachEntry()) {
        if (!entry.fileName.startsWith('windows/')) throw new Error('Unexpected launcher archive layout');
        if (entry.fileName.endsWith('/')) continue;
        const relative = entry.fileName.slice('windows/'.length);
        const target = resolveSafePath(nextApp, relative === 'electron.exe' ? 'PackPanel.exe' : relative);
        const key = target.toLowerCase();
        extractedBytes += entry.uncompressedSize;
        if (destinations.has(key) || relative.toLowerCase() === 'resources/app/launcher-config.json' ||
            (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000 || extractedBytes > 768 * 1024 * 1024 || destinations.size >= 12_000) {
          throw new Error('Invalid launcher archive entry');
        }
        destinations.add(key);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await pipeline(await archive.openReadStreamPromise(entry), fs.createWriteStream(target, { flags: 'wx' }));
      }
    } finally { archive.close(); }
    const configFolder = path.join(nextApp, 'resources', 'app');
    const next = LauncherRuntimeSchema.parse(JSON.parse(await fs.promises.readFile(path.join(configFolder, 'launcher-runtime.json'), 'utf8')));
    if (next.revision !== update.release.revision || next.sequence !== update.release.sequence ||
        next.publicKey !== update.installed.publicKey ||
        !fs.existsSync(path.join(nextApp, 'PackPanel.exe'))) throw new Error('Launcher update metadata mismatch');
    await fs.promises.writeFile(path.join(configFolder, 'launcher-runtime.json'), JSON.stringify({ ...next, feed: update.installed.feed }));
    await fs.promises.copyFile(path.join(root, 'app', 'resources', 'app', 'launcher-config.json'), path.join(configFolder, 'launcher-config.json'), fs.constants.COPYFILE_EXCL);
    await startWindowsUpgrade({ root, work, instanceId, token: randomUUID(), sequence: next.sequence, userData });
  } catch (error) {
    await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
