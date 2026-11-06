import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { LauncherRuntimeSchema, launcherUpdatePublicKey, signLauncherRuntime, verifyLauncherRuntime } from '@packpanel/protocol/launcher-update';
import { DATA_DIR, getFilesBaseUrl } from '../config';
import { hashFile } from '../storage/hasher';
import { appendDesktopRuntime } from './desktop-package';

const updateDir = path.join(DATA_DIR, 'launcher-updates');
const feedFile = path.join(updateDir, 'windows-x64.json');
const pendingFile = path.join(updateDir, 'windows-x64.pending.json');
const keyFile = process.env.PACKPANEL_LAUNCHER_KEY_FILE || '/run/packpanel-signing/launcher.pem';
const expiry = () => Date.now() + 90 * 24 * 60 * 60 * 1000;

export async function runtimeForInstaller() {
  const revision = process.env.PACKPANEL_BUILD_REVISION;
  if (!revision) return;
  const publicKey = launcherUpdatePublicKey(await fs.promises.readFile(keyFile, 'utf8'));
  for (const file of [feedFile, pendingFile]) {
    const envelope = await fs.promises.readFile(file, 'utf8').catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!envelope) continue;
    const release = verifyLauncherRuntime(JSON.parse(envelope), publicKey, 0);
    if (release.revision === revision) {
      return LauncherRuntimeSchema.parse({ revision, sequence: release.sequence, publicKey, feed: `${getFilesBaseUrl()}/launcher-updates/windows-x64.json` });
    }
  }
  throw new Error('La version Windows préparée ne correspond pas au worker.');
}

export async function renewWindowsRuntimeFeed() {
  const revision = process.env.PACKPANEL_BUILD_REVISION;
  if (!revision || !fs.existsSync(feedFile)) return;
  const lock = path.join(updateDir, '.publish-lock');
  try { await fs.promises.mkdir(lock); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    throw error;
  }
  try {
    const key = await fs.promises.readFile(keyFile, 'utf8');
    const release = verifyLauncherRuntime(JSON.parse(await fs.promises.readFile(feedFile, 'utf8')), launcherUpdatePublicKey(key), 0);
    if (release.revision !== revision || release.expiresAt > Date.now() + 30 * 24 * 60 * 60 * 1000) return;
    const temporary = path.join(lock, 'renew.json');
    await fs.promises.writeFile(temporary, JSON.stringify(signLauncherRuntime({ ...release, expiresAt: expiry() }, key)), { mode: 0o644 });
    await fs.promises.rename(temporary, feedFile);
  } finally { await fs.promises.rm(lock, { force: true, recursive: true }); }
}

async function publishWindowsRuntime(activate: boolean) {
  const revision = process.env.PACKPANEL_BUILD_REVISION;
  if (!revision || !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Missing PackPanel build revision');
  const key = await fs.promises.readFile(keyFile, 'utf8');
  const publicKey = launcherUpdatePublicKey(key);
  await fs.promises.mkdir(updateDir, { recursive: true, mode: 0o755 });
  const lock = path.join(updateDir, '.publish-lock');
  await fs.promises.mkdir(lock);
  const temporaryZip = path.join(lock, 'runtime.zip');
  const temporaryFeed = path.join(lock, `${randomUUID()}.json`);
  try {
    if (activate) {
      const pending = verifyLauncherRuntime(JSON.parse(await fs.promises.readFile(pendingFile, 'utf8')), publicKey);
      if (pending.revision !== revision || !fs.existsSync(path.join(updateDir, `${pending.sha256}.zip`))) {
        throw new Error('The prepared launcher update does not match the deployment');
      }
      await fs.promises.rename(pendingFile, feedFile);
      console.log(`Published Windows launcher runtime ${revision.slice(0, 7)} (${pending.sequence})`);
      return;
    }
    const previous = fs.existsSync(feedFile)
      ? verifyLauncherRuntime(JSON.parse(await fs.promises.readFile(feedFile, 'utf8')), publicKey, 0)
      : undefined;
    let release;
    if (previous?.revision === revision && fs.existsSync(path.join(updateDir, `${previous.sha256}.zip`))) {
      release = { ...previous, expiresAt: expiry() };
    } else {
      const runtime = LauncherRuntimeSchema.parse({
        revision, sequence: Math.max(Date.now(), (previous?.sequence ?? 0) + 1), publicKey,
        feed: `${getFilesBaseUrl()}/launcher-updates/windows-x64.json`
      });
      const { ZipArchive } = require('archiver');
      const archive = new ZipArchive({ zlib: { level: 3 } });
      const controller = new AbortController();
      const write = pipeline(archive, fs.createWriteStream(temporaryZip, { mode: 0o644 }), { signal: controller.signal });
      void write.catch(error => controller.abort(error));
      try {
        await appendDesktopRuntime(archive, 'windows', undefined, controller.signal, runtime);
        await archive.finalize();
        await write;
      } catch (error) {
        controller.abort(error);
        await write.catch(() => {});
        throw error;
      }
      const { sha256, sizeBytes } = await hashFile(temporaryZip);
      await fs.promises.rename(temporaryZip, path.join(updateDir, `${sha256}.zip`));
      release = { kind: 'packpanel-windows-x64-v1' as const, revision, sequence: runtime.sequence, sha256, bytes: sizeBytes, expiresAt: expiry() };
    }
    await fs.promises.writeFile(temporaryFeed, JSON.stringify(signLauncherRuntime(release, key)), { mode: 0o644 });
    await fs.promises.rename(temporaryFeed, pendingFile);
    console.log(`Prepared Windows launcher runtime ${revision.slice(0, 7)} (${release.sequence})`);
  } finally {
    await fs.promises.rm(lock, { force: true, recursive: true });
  }
}

if (require.main === module) void publishWindowsRuntime(process.argv.includes('--activate')).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
