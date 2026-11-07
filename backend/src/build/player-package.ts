import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { text } from 'node:stream/consumers';
import { openPromise } from 'yauzl';

const run = promisify(execFile);
export type PlayerPlatform = 'windows' | 'linux' | 'macos';
export const playerExtensions = { windows: '.msi', linux: '.AppImage', macos: '.dmg', 'macos-arm64': '.dmg' } as const;
const icon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#4f46e5"/><path d="m32 12 19 10v20L32 52 13 42V22Zm0 20 19-10M32 32 13 22m19 10v20" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/></svg>\n';
const appImageRuntime = '/usr/local/share/packpanel/appimage-runtime';

async function unpackRuntime(zipPath: string, platform: PlayerPlatform, root: string) {
  const zip = await openPromise(zipPath, { lazyEntries: true });
  const prefix = platform + '/';
  try {
    for await (const entry of zip.eachEntry()) {
      if (!entry.fileName.startsWith(prefix) || entry.fileName.endsWith('/')) continue;
      const relative = entry.fileName.slice(prefix.length);
      if (relative.startsWith('run-launcher.')) continue;
      const destination = path.resolve(root, platform === 'windows' && relative === 'electron.exe' ? 'PackPanel.exe' : relative);
      if (!destination.startsWith(root + path.sep)) throw new Error('Invalid desktop runtime path');
      const mode = entry.externalFileAttributes >>> 16;
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      const stream = await zip.openReadStreamPromise(entry);
      if ((mode & 0xf000) === 0xa000) {
        const link = await text(stream);
        if (platform !== 'macos' || path.isAbsolute(link) || !path.resolve(path.dirname(destination), link).startsWith(root + path.sep)) {
          throw new Error('Invalid desktop runtime symlink');
        }
        await fs.promises.symlink(link, destination);
      } else {
        await pipeline(stream, fs.createWriteStream(destination, { flags: 'wx', mode: mode & 0o777 || 0o644 }));
      }
    }
  } finally { zip.close(); }
}

interface Pack {
  id: string;
  buildId: string;
  slug: string;
  title: string;
  version: string;
}

async function buildMsi(work: string, output: string, pack: Pack) {
  const xmlEscapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const title = pack.title.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[&<>"]/g, c => xmlEscapes[c]) || 'PackPanel';
  const options = { cwd: work, timeout: 300_000 };
  await fs.promises.copyFile(path.join(__dirname, '../../src/build/windows-starter.nsi'), path.join(work, 'portable.nsi'));
  await run('makensis', ['-V2', `-DPACK_ID=${pack.id}`, `-DBUILD_ID=${pack.buildId}`, 'portable.nsi'], options);
  await fs.promises.writeFile(path.join(work, 'launcher.wxs'), `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="${pack.buildId}" Name="${title}" Manufacturer="PackPanel" Language="1033"
           Version="${pack.version}" UpgradeCode="${pack.id}">
    <Package InstallerVersion="500" InstallScope="perUser" Compressed="yes"/>
    <MajorUpgrade DowngradeErrorMessage="A newer launcher is already installed."/>
    <Media Id="1" Cabinet="launcher.cab" EmbedCab="yes"/>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="ProgramsFolder" Name="Programs">
          <Directory Id="PackPanelFolder" Name="PackPanel">
            <Directory Id="INSTALLDIR" Name="${pack.id}-msi">
              <Component Id="Launcher" Guid="${pack.id}" Win64="yes">
                <File Id="LauncherExe" Name="PackPanel.exe" Source="PackPanel.exe" DiskId="1"/>
                <Shortcut Id="LaunchPack" Directory="ProgramMenuFolder" Name="PackPanel - ${pack.slug}"
                          Target="[#LauncherExe]" WorkingDirectory="INSTALLDIR" Advertise="no"/>
                <RegistryValue Root="HKCU" Key="Software\\PackPanel\\${pack.id}" Name="Installed"
                               Type="integer" Value="1" KeyPath="yes"/>
              </Component>
            </Directory>
          </Directory>
        </Directory>
      </Directory>
      <Directory Id="ProgramMenuFolder"/>
    </Directory>
    <Feature Id="Main" Level="1"><ComponentRef Id="Launcher"/></Feature>
  </Product>
</Wix>
`);
  await run('wixl', ['-a', 'x64', '-o', 'launcher.msi', 'launcher.wxs'], options);
  await fs.promises.rename(path.join(work, 'launcher.msi'), output);
}

async function buildAppImage(work: string, root: string, output: string) {
  await fs.promises.writeFile(path.join(root, 'AppRun'),
    '#!/bin/sh\nset -eu\nDIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$DIR/electron" "$@"\n', { mode: 0o755 });
  await fs.promises.writeFile(path.join(root, 'packpanel.desktop'),
    '[Desktop Entry]\nName=PackPanel\nType=Application\nExec=AppRun\nIcon=packpanel\nCategories=Game;\n');
  await fs.promises.writeFile(path.join(root, 'packpanel.svg'), icon);
  await fs.promises.symlink('packpanel.svg', path.join(root, '.DirIcon'));
  const squashfs = path.join(work, 'payload.squashfs');
  await run('mksquashfs', [root, squashfs, '-noappend', '-all-root', '-comp', 'gzip', '-processors', '2', '-quiet'], { timeout: 300_000 });
  await fs.promises.copyFile(appImageRuntime, output, fs.constants.COPYFILE_EXCL);
  await pipeline(fs.createReadStream(squashfs), fs.createWriteStream(output, { flags: 'a' }));
  await fs.promises.chmod(output, 0o755);
}

export async function buildPlayerPackage(zip: string, output: string, platform: PlayerPlatform, pack: Pack) {
  if (![pack.id, pack.buildId].every(id => /^[a-f0-9-]{36}$/.test(id)) ||
      !/^[a-z0-9_-]{1,64}$/.test(pack.slug) || !/^1\.0\.\d{1,5}$/.test(pack.version) || Number(pack.version.split('.')[2]) > 65535) {
    throw new Error('Invalid launcher package identifier or version');
  }
  const work = await fs.promises.mkdtemp(path.join(path.dirname(output), '.package-'));
  const root = path.join(work, 'application');
  try {
    await unpackRuntime(zip, platform, root);
    if (platform === 'windows') {
      await buildMsi(work, output, pack);
    } else if (platform === 'linux') {
      await buildAppImage(work, root, output);
    } else {
      const bundle = path.join(root, `PackPanel-${pack.slug}.app`);
      await fs.promises.rename(path.join(root, 'Electron.app'), bundle);
      const info = path.join(bundle, 'Contents', 'Info.plist');
      const plist = await fs.promises.readFile(info, 'utf8');
      await fs.promises.writeFile(info, plist
        .replace(/(<key>CFBundle(?:DisplayName|Name)<\/key>\s*<string>)Electron(<\/string>)/g, '$1PackPanel$2')
        .replace('<string>com.github.Electron</string>', `<string>com.packpanel.launcher.${pack.id}</string>`));
      const frameworks = path.join(bundle, 'Contents', 'Frameworks');
      for (const helper of await fs.promises.readdir(frameworks)) {
        if (!/^Electron Helper(?: \(GPU\)| \(Plugin\)| \(Renderer\))?\.app$/.test(helper)) continue;
        const contents = path.join(frameworks, helper, 'Contents');
        const executable = helper.slice(0, -4);
        await fs.promises.access(path.join(contents, 'MacOS', executable), fs.constants.X_OK);
        const helperInfo = path.join(contents, 'Info.plist');
        const helperPlist = await fs.promises.readFile(helperInfo, 'utf8');
        // Electron's upstream helper plists omit CFBundleExecutable. The signer needs it to seal each helper.
        if (!helperPlist.includes('<key>CFBundleExecutable</key>')) {
          await fs.promises.writeFile(helperInfo, helperPlist.replace('<dict>',
            `<dict>\n\t<key>CFBundleExecutable</key>\n\t<string>${executable}</string>`));
        }
      }
      await run('rcodesign', ['sign', bundle], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
      await fs.promises.symlink('/Applications', path.join(root, 'Applications'));
      await run('packpanel-dmg', [root, output], { timeout: 300_000 });
    }
  } catch (error: any) {
    throw new Error(`Package ${platform}: ${error.stderr?.trim() || error.message}`, { cause: error });
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
  }
}
