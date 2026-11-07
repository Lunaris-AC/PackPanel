import fs from 'fs';
import path from 'path';
import { finished } from 'node:stream/promises';
import { text } from 'node:stream/consumers';
import { openPromise } from 'yauzl';
import { downloadArtifact } from '@electron/get';
import { config, DATA_DIR } from '../config';
import type { LauncherRuntime } from '@packpanel/protocol/launcher-update';

export const ELECTRON_VERSION = '44.10.2';

export async function appendDesktopRuntime(archive: any, target: 'windows' | 'linux' | 'macos', launcherConfig: unknown, signal: AbortSignal, runtime?: LauncherRuntime, arch: 'x64' | 'arm64' = 'x64'): Promise<void> {
  const platform = target === 'windows' ? 'win32' : target === 'macos' ? 'darwin' : 'linux';
  const runtimeZip = await downloadArtifact({
    version: ELECTRON_VERSION, artifactName: 'electron', platform, arch,
    cacheRoot: path.join(DATA_DIR, 'cache', 'electron'),
    downloadOptions: { signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]), quiet: true }
  }).catch(error => {
    throw new Error(`Impossible de récupérer Electron pour ${target} : ${error.message}`, { cause: error });
  });
  const prefix = target + '/';
  const appRoot = prefix + (target === 'macos' ? 'Electron.app/Contents/Resources/app/' : 'resources/app/');
  const appDir = fs.existsSync(path.join(config.APP_DIR, 'packages')) ? config.APP_DIR : path.resolve(__dirname, '../../..');
  const launcherDir = path.join(appDir, 'packages', 'launcher');
  if (!fs.existsSync(path.join(launcherDir, 'dist', 'main', 'index.js')) || !fs.existsSync(path.join(launcherDir, 'dist', 'renderer', 'index.html'))) {
    throw new Error('Le programme du launcher est absent. Compilez tous les packages avant de générer un launcher.');
  }
  const zip = await openPromise(runtimeZip, { lazyEntries: true });
  try {
    for await (const entry of zip.eachEntry()) {
      signal.throwIfAborted();
      if (entry.fileName.endsWith('/')) continue;
      const mode = entry.externalFileAttributes >>> 16;
      const name = prefix + entry.fileName;
      const stream = await zip.openReadStreamPromise(entry);
      if ((mode & 0xf000) === 0xa000) {
        archive.symlink(name, await text(stream));
      } else {
        const consumed = finished(stream, { cleanup: true, signal });
        archive.append(stream, { name, mode: mode || 0o644 });
        try { await consumed; }
        finally { stream.destroy(); }
      }
    }
  } finally {
    zip.close();
  }
  archive.append(JSON.stringify({ name: 'packpanel-desktop', version: '2.0.0', main: 'dist/main/index.js' }), { name: appRoot + 'package.json' });
  if (launcherConfig) archive.append(JSON.stringify(launcherConfig, null, 2), { name: appRoot + 'launcher-config.json' });
  if (runtime) archive.append(JSON.stringify(runtime), { name: appRoot + 'launcher-runtime.json' });
  archive.directory(path.join(launcherDir, 'dist'), appRoot + 'dist');
  for (const pkg of ['@packpanel/engine', '@packpanel/protocol', 'adm-zip', 'zod', 'yauzl', 'pend']) {
    const packageDir = path.dirname(require.resolve(pkg + '/package.json'));
    if (pkg.startsWith('@packpanel/')) {
      archive.file(path.join(packageDir, 'package.json'), { name: appRoot + 'node_modules/' + pkg + '/package.json' });
      archive.directory(path.join(packageDir, 'dist'), appRoot + 'node_modules/' + pkg + '/dist');
    } else {
      archive.directory(packageDir, appRoot + 'node_modules/' + pkg, (entry: any) => entry.name.includes('/node_modules/') && entry.name.includes('/node_modules/' + pkg + '/node_modules/') ? false : entry);
    }
  }
  if (target === 'windows' && launcherConfig) archive.append('@echo off\r\nstart "" "%~dp0electron.exe"\r\n', { name: prefix + 'run-launcher.bat' });
  if (target === 'linux') archive.append('#!/usr/bin/env sh\nset -eu\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$DIR/electron" "$@"\n', { name: prefix + 'run-launcher.sh', mode: 0o755 });
  if (target === 'macos') archive.append('#!/usr/bin/env sh\nset -eu\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec open "$DIR/Electron.app"\n', { name: prefix + 'run-launcher.sh', mode: 0o755 });
}
