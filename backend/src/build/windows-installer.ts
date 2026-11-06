import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { openPromise } from 'yauzl';

const run = promisify(execFile);

export async function buildWindowsInstaller(
  zipPath: string, outputPath: string, pack: { id: string; slug: string; title: string; version: string }
): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(pack.id) || !/^[a-z0-9_-]{1,64}$/.test(pack.slug) || !/^\d+\.\d+\.\d+$/.test(pack.version)) {
    throw new Error('Identifiant ou version de l’installateur invalide.');
  }
  const work = await fs.promises.mkdtemp(path.join(path.dirname(outputPath), '.installer-'));
  try {
    const root = path.join(work, 'application');
    const zip = await openPromise(zipPath, { lazyEntries: true });
    try {
      for await (const entry of zip.eachEntry()) {
        if (!entry.fileName.startsWith('windows/') || entry.fileName.endsWith('/')) continue;
        const relative = entry.fileName.slice('windows/'.length);
        if (relative === 'run-launcher.bat') continue;
        const destination = path.resolve(root, relative === 'electron.exe' ? 'PackPanel.exe' : relative);
        if (!destination.startsWith(root + path.sep) || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000) {
          throw new Error('Chemin invalide dans le runtime Windows');
        }
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await pipeline(await zip.openReadStreamPromise(entry), fs.createWriteStream(destination));
      }
    } finally { zip.close(); }

    // Keep branding text separate from NSIS preprocessor syntax.
    const title = pack.title.replace(/[\u0000-\u001f\u007f$"'\\]/g, ' ').trim() || 'PackPanel';
    const source = path.join(__dirname, '../../src/build');
    await fs.promises.copyFile(path.join(source, 'windows-installer.nsi'), path.join(work, 'installer.nsi'));
    await fs.promises.copyFile(path.join(source, 'windows-starter.nsi'), path.join(work, 'starter.nsi'));
    try {
      const options = { cwd: work, env: { ...process.env, LC_ALL: 'C.UTF-8' }, timeout: 300_000 };
      await run('makensis', ['-V2', '-INPUTCHARSET', 'UTF8', `-DPACK_ID=${pack.id}`, 'starter.nsi'], options);
      await run('makensis', [
        '-V2', '-INPUTCHARSET', 'UTF8', `-DPACK_ID=${pack.id}`, `-DPACK_SLUG=${pack.slug}`,
        `-DPACK_TITLE=${title}`, `-DPACK_VERSION=${pack.version}`, 'installer.nsi'
      ], options);
    } catch (error: any) {
      throw new Error(`Échec de l’installateur Windows : ${error.stderr?.trim() || error.message}`, { cause: error });
    }
    await fs.promises.rename(path.join(work, 'PackPanelInstaller.exe'), outputPath);
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
  }
}
