import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import { MojangVersionJson, MojangVersionResolver, MojangLibrary } from '../mojang/version.js';
import { downloadFile } from '../utils/http.js';
import { computeFileHashes } from '../utils/hasher.js';
import { mavenToPath, resolveSafePath } from '../utils/platform.js';
import type { ForgeInstallProfile } from './forge.js';

export function mergeLoaderLibraries(loader: MojangLibrary[], vanilla: MojangLibrary[]): MojangLibrary[] {
  const seen = new Set<string>();
  return [...loader, ...vanilla].filter(lib => {
    const parts = lib.name.split(':');
    const key = [parts[0], parts[1], parts[3] || ''].join(':');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function runInstallerProcessors(baseDir: string, installerPath: string, vanilla: MojangVersionJson, javaPath: string): Promise<void> {
  const zip = new AdmZip(installerPath);
  const profileEntry = zip.getEntry('install_profile.json');
  if (!profileEntry) return;
  const profile = JSON.parse(profileEntry.getData().toString('utf8')) as ForgeInstallProfile;
  if (profile.minecraft !== vanilla.id) throw new Error('L’installeur ne correspond pas à la version Minecraft.');
  const marker = installerPath + '.client-installed';
  if (fs.existsSync(marker)) return;
  const librariesDir = path.join(baseDir, 'libraries');
  const inputsDir = path.join(baseDir, 'cache', 'installer-data', path.basename(installerPath));
  fs.mkdirSync(inputsDir, { recursive: true });
  const resolver = new MojangVersionResolver(baseDir);
  const clientJar = await resolver.downloadClientJar(vanilla);
  const data: Record<string, string> = { SIDE: 'client', ROOT: baseDir, INSTALLER: installerPath, LIBRARY_DIR: librariesDir, MINECRAFT_JAR: clientJar, MINECRAFT_VERSION: vanilla.id };
  for (const [key, value] of Object.entries(profile.data || {})) {
    const raw = value.client;
    if (raw.startsWith('/')) {
      const entry = zip.getEntry(raw.slice(1));
      if (!entry) throw new Error(`Fichier d’installation absent: ${raw}`);
      const dest = resolveSafePath(inputsDir, raw.slice(1));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.getData());
      data[key] = dest;
    } else data[key] = raw;
  }
  const resolveValue = (raw: string): string => {
    let value = raw;
    for (let i = 0; i < 10; i++) {
      const next = value.replace(/\{([^}]+)\}/g, (match, key) => data[key] ?? match);
      if (next === value) break;
      value = next;
    }
    if (/^\[[^\]]+\]$/.test(value)) return resolveSafePath(librariesDir, mavenToPath(value.slice(1, -1)));
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (/\{[^}]+\}/.test(value)) throw new Error(`Variable d’installation inconnue: ${value}`);
    return value;
  };
  for (const lib of profile.libraries || []) {
    const artifact = lib.downloads?.artifact;
    const relative = artifact?.path || mavenToPath(lib.name);
    const target = resolveSafePath(librariesDir, relative);
    const embedded = zip.getEntry('maven/' + relative);
    if (embedded) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, embedded.getData());
    } else if (artifact?.url || lib.url) {
      const url = artifact?.url || lib.url!.replace(/\/+$/, '') + '/' + relative;
      await downloadFile(url, target, { expectedSha1: artifact?.sha1, expectedSize: artifact?.size });
    }
  }
  for (const processor of profile.processors || []) {
    if (processor.sides && !processor.sides.includes('client')) continue;
    const outputs = Object.entries(processor.outputs || {}).map(([file, hash]) => [resolveValue(file), resolveValue(hash)]);
    if (outputs.length && (await Promise.all(outputs.map(async ([file, hash]) => fs.existsSync(file) && (await computeFileHashes(file)).sha1 === hash))).every(Boolean)) continue;
    const jar = resolveSafePath(librariesDir, mavenToPath(processor.jar));
    const manifest = new AdmZip(jar).getEntry('META-INF/MANIFEST.MF')?.getData().toString('utf8').replace(/\r?\n /g, '');
    const mainClass = manifest?.match(/^Main-Class: (.+)$/m)?.[1].trim();
    if (!mainClass) throw new Error(`Classe principale absente du processeur ${processor.jar}`);
    const classpath = [jar, ...processor.classpath.map(coord => resolveSafePath(librariesDir, mavenToPath(coord)))].join(path.delimiter);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(javaPath, ['-cp', classpath, mainClass, ...processor.args.map(resolveValue)], { cwd: baseDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const collect = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-12000); };
      proc.stdout.on('data', collect); proc.stderr.on('data', collect);
      const timeout = setTimeout(() => { proc.kill(); reject(new Error('Délai d’installation dépassé.')); }, 300000);
      proc.on('error', error => { clearTimeout(timeout); reject(error); });
      proc.on('close', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Processeur ${processor.jar} en erreur (${code}): ${output}`)); });
    });
    for (const [file, hash] of outputs) {
      if (!fs.existsSync(file) || (await computeFileHashes(file)).sha1 !== hash) throw new Error(`Sortie d’installation invalide: ${file}`);
    }
  }
  fs.writeFileSync(marker, 'completed');
}
