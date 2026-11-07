import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { computeFileHashes, downloadFile } from '@packpanel/engine';
import { NativeLauncherRuntimeSchema, verifyNativeLauncher, type NativeLauncherRelease } from '@packpanel/protocol/launcher-update';
import { readEnvelope, type LauncherUpdateState } from './launcher-updater';

const run = promisify(execFile);
const pendingName = 'native-upgrade.pending';
const failedName = 'native-upgrade.failed';

type InstallTarget = { path: string; executable: string };
type NativeUpgrade = { archive: string; release: NativeLauncherRelease; target: InstallTarget };

function readyName(token: string) { return 'native-upgrade-ready-' + token; }

async function bundleId(bundle: string) {
  const { stdout } = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(bundle, 'Contents', 'Info.plist')], { timeout: 5000 });
  return stdout.trim();
}

async function installTarget(platform: NativeLauncherRelease['platform'], instanceId: string): Promise<InstallTarget | undefined> {
  if (platform === 'linux') {
    const appImage = process.env.APPIMAGE;
    if (process.platform !== 'linux' || process.arch !== 'x64' || !appImage || !path.isAbsolute(appImage)) return;
    const target = await fs.promises.realpath(appImage);
    const handle = await fs.promises.open(target, 'r');
    try {
      const header = Buffer.alloc(11);
      const { bytesRead } = await handle.read(header);
      if (bytesRead !== 11 || header.toString('hex', 0, 4) !== '7f454c46' || header.toString('hex', 8) !== '414902') return;
    } finally { await handle.close(); }
    return { path: target, executable: target };
  }

  const expectedArch = platform === 'macos-arm64' ? 'arm64' : 'x64';
  if (process.platform !== 'darwin' || process.arch !== expectedArch) return;
  const target = path.resolve(path.dirname(process.execPath), '../..');
  if (!target.endsWith('.app') || target.startsWith('/Volumes/') ||
      path.dirname(process.execPath) !== path.join(target, 'Contents', 'MacOS') ||
      await bundleId(target) !== 'com.packpanel.launcher.' + instanceId) return;
  return { path: target, executable: process.execPath };
}

export async function downloadNativeUpgrade(
  appRoot: string,
  playerDir: string,
  instance: { id: string; slug: string; manifestUrl: string },
  report: (state: LauncherUpdateState) => void
): Promise<NativeUpgrade | undefined> {
  const metadata = await fs.promises.readFile(path.join(appRoot, 'launcher-runtime.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (!metadata) return;
  const runtime = NativeLauncherRuntimeSchema.parse(JSON.parse(metadata));
  const target = await installTarget(runtime.platform, instance.id);
  if (!target || fs.existsSync(path.join(playerDir, pendingName))) return;
  const base = '/play-api/' + encodeURIComponent(instance.slug);
  const feed = new URL(base + '/updates/' + runtime.platform, instance.manifestUrl);
  if (feed.protocol !== 'https:' && feed.protocol !== 'http:') throw new Error('Invalid native launcher update feed');
  const envelope = await readEnvelope(feed.href, true);
  if (!envelope) return;

  const release = verifyNativeLauncher(envelope, runtime.publicKey);
  if (release.instanceId !== instance.id || release.platform !== runtime.platform) throw new Error('Native launcher update does not match this installation');
  if (release.sequence <= runtime.sequence) return;
  const failed = await fs.promises.readFile(path.join(playerDir, failedName), 'utf8').catch(() => '');
  if (failed.trim() === String(release.sequence)) throw new Error('This launcher version previously failed to start');
  await fs.promises.access(path.dirname(target.path), fs.constants.W_OK | fs.constants.X_OK);
  const archive = path.join(playerDir, 'native-update', release.platform === 'linux' ? 'download.AppImage' : 'download.dmg');
  let previous = -1;
  await downloadFile(new URL(base + '/downloads/' + release.buildId, feed).href, archive, {
    expectedSize: release.bytes, expectedSha256: release.sha256, maxRetries: 2, redirect: 'error',
    onProgress: done => {
      const percent = Math.floor(done * 100 / release.bytes);
      if (percent !== previous) { previous = percent; report({ state: 'downloading', percent }); }
    }
  });
  return { archive, release, target };
}

export function confirmNativeUpgrade(playerDir: string, token: string) {
  if (!/^[a-f0-9-]{36}$/i.test(token) || fs.readFileSync(path.join(playerDir, pendingName), 'utf8') !== token) {
    throw new Error('Invalid native launcher update handoff');
  }
  fs.writeFileSync(path.join(playerDir, readyName(token)), 'ready', { flag: 'wx', mode: 0o600 });
}

async function prepareMacBundle(archive: string, work: string, instanceId: string) {
  const mount = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'packpanel-dmg-'));
  let mounted = false;
  try {
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, archive], { timeout: 45000 });
    mounted = true;
    const entries = await fs.promises.readdir(mount, { withFileTypes: true });
    const bundles = entries.filter(entry => entry.isDirectory() && entry.name.endsWith('.app'));
    if (bundles.length !== 1) throw new Error('Invalid launcher disk image');
    const next = path.join(work, 'next.app');
    await run('/usr/bin/ditto', [path.join(mount, bundles[0].name), next], { timeout: 90000 });
    if (await bundleId(next) !== 'com.packpanel.launcher.' + instanceId) throw new Error('Launcher bundle identifier mismatch');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', next], { timeout: 45000 });
    await fs.promises.rename(next, path.join(work, 'next'));
  } finally {
    if (mounted) await run('/usr/bin/hdiutil', ['detach', mount], { timeout: 15000 });
    await fs.promises.rmdir(mount);
  }
}

// The detached helper only swaps the application after this process exits.
const swap = `
set -eu
parent=$1
target=$2
executable=$3
work=$4
pending=$5
ready=$6
failed=$7
token=$8
sequence=$9
shift 9
child=
committed=0
launch() {
  if [ -n "$1" ]; then
    if [ -n "$2" ]; then
      "$executable" "--user-data-dir=$2" "--packpanel-native-health=$1" &
    else
      "$executable" "--packpanel-native-health=$1" &
    fi
  elif [ -n "$2" ]; then
    "$executable" "--user-data-dir=$2" &
  else
    "$executable" &
  fi
  child=$!
}
cleanup() {
  if [ "$committed" -eq 0 ] && [ -e "$work/previous" ]; then
    if [ -n "$child" ]; then kill "$child" 2>/dev/null || true; fi
    if [ -e "$target" ]; then mv "$target" "$work/rejected" || return; fi
    mv "$work/previous" "$target" || return
    printf '%s\\n' "$sequence" > "$failed"
    launch '' "$1"
  fi
  rm -f "$pending" "$ready"
  rm -rf "$work"
}
trap 'cleanup "$1"' EXIT
trap 'exit 1' HUP INT TERM
attempt=0
while kill -0 "$parent" 2>/dev/null; do
  [ "$attempt" -lt 45 ] || exit 1
  sleep 1
  attempt=$((attempt+1))
done
mv "$target" "$work/previous"
mv "$work/next" "$target"
launch "$token" "$1"
attempt=0
while [ ! -f "$ready" ]; do
  kill -0 "$child" 2>/dev/null || exit 1
  [ "$attempt" -lt 45 ] || exit 1
  sleep 1
  attempt=$((attempt+1))
done
committed=1
rm -f "$failed"
`;

export async function installNativeUpgrade(update: NativeUpgrade, playerDir: string, userData: string) {
  const { archive, release, target } = update;
  const hash = await computeFileHashes(archive);
  if (hash.sha256 !== release.sha256 || hash.size !== release.bytes) throw new Error('Launcher update file has changed');
  await fs.promises.mkdir(playerDir, { recursive: true, mode: 0o700 });
  const token = randomUUID();
  const pending = path.join(playerDir, pendingName);
  await fs.promises.writeFile(pending, token, { flag: 'wx', mode: 0o600 });
  let work: string | undefined;
  try {
    work = await fs.promises.mkdtemp(path.join(path.dirname(target.path), '.packpanel-upgrade-'));
    if (release.platform === 'linux') {
      const next = path.join(work, 'next');
      await fs.promises.copyFile(archive, next, fs.constants.COPYFILE_EXCL);
      await fs.promises.chmod(next, 0o755);
    } else {
      await prepareMacBundle(archive, work, release.instanceId);
    }

    const env = { ...process.env };
    for (const key of ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD']) delete env[key];
    const child = spawn('/bin/sh', ['-c', swap, 'packpanel-upgrade', String(process.pid), target.path, target.executable,
      work, pending, path.join(playerDir, readyName(token)), path.join(playerDir, failedName),
      token, String(release.sequence), userData], {
      cwd: path.dirname(target.path), env, detached: true, stdio: 'ignore'
    });
    await once(child, 'spawn');
    child.unref();
  } catch (error) {
    if (work) await fs.promises.rm(work, { force: true, recursive: true }).catch(() => {});
    await fs.promises.rm(pending, { force: true }).catch(() => {});
    throw error;
  }
}
