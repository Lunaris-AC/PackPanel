import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';
import { downloadFile } from '../utils/http.js';

export function getRecommendedJavaVersion(minecraftVersion: string): number {
  const parts = minecraftVersion.split('.').map(Number);
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;

  if (minor <= 16) return 8;
  if (minor < 20 || (minor === 20 && patch <= 4)) return 17;
  return 21;
}

export function getSystemJavaInfo(customJavaPath?: string): { valid: boolean; majorVersion?: number; path?: string } {
  const javaExec = customJavaPath || (process.platform === 'win32' ? 'java.exe' : 'java');

  try {
    const output = execSync(`"${javaExec}" -version 2>&1`, { encoding: 'utf8', timeout: 5000 });
    // Match strings like:
    // openjdk version "17.0.10" or java version "1.8.0_351" or "21.0.2"
    const match = output.match(/version "(?:1\.)?(\d+)/i);
    if (match && match[1]) {
      return {
        valid: true,
        majorVersion: parseInt(match[1], 10),
        path: javaExec
      };
    }
  } catch (e) {
    // Java not in PATH or execution failed
  }

  return { valid: false };
}

export class JavaRuntimeManager {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Resolves a working Java executable matching the required major version.
   * If local system Java satisfies the requirement, it is used.
   * Otherwise, downloads and uncompresses Adoptium Temurin JRE into isolated runtimes directory.
   */
  async resolveJavaPath(
    requiredMajorVersion: number,
    onProgress?: (done: number, total: number) => void
  ): Promise<string> {
    const runtimeDir = path.join(this.baseDir, 'runtimes', `java-${requiredMajorVersion}`);
    const binSubdir = process.platform === 'darwin' ? 'Contents/Home/bin' : 'bin';
    const binaryName = process.platform === 'win32' ? 'java.exe' : 'java';

    // 1. Check if we already have an isolated installed runtime
    if (fs.existsSync(runtimeDir)) {
      const candidates = [
        path.join(runtimeDir, 'bin', binaryName),
        path.join(runtimeDir, binSubdir, binaryName)
      ];
      // Search recursively in first-level directory (Adoptium zips often extract into jdk-17.x.x/)
      const subdirs = fs.readdirSync(runtimeDir, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const d of subdirs) {
        candidates.push(path.join(runtimeDir, d.name, 'bin', binaryName));
        candidates.push(path.join(runtimeDir, d.name, binSubdir, binaryName));
      }

      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          const test = getSystemJavaInfo(cand);
          if (test.valid && test.majorVersion === requiredMajorVersion) {
            return cand;
          }
        }
      }
    }

    // 2. Check if host system Java matches
    const sys = getSystemJavaInfo();
    if (sys.valid && sys.majorVersion === requiredMajorVersion && sys.path) {
      return sys.path;
    }

    // 3. Download Adoptium Temurin JRE
    if (!fs.existsSync(runtimeDir)) {
      fs.mkdirSync(runtimeDir, { recursive: true });
    }

    const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
    const archName = os.arch() === 'arm64' ? 'aarch64' : 'x64';
    const archiveExt = process.platform === 'win32' ? 'zip' : 'tar.gz';
    const archivePath = path.join(this.baseDir, 'runtimes', `temurin-${requiredMajorVersion}.${archiveExt}`);

    const adoptiumApiUrl = `https://api.adoptium.net/v3/binary/latest/${requiredMajorVersion}/ga/${osName}/${archName}/jre/hotspot/normal/eclipse`;

    await downloadFile(adoptiumApiUrl, archivePath, { onProgress });

    if (archiveExt === 'zip') {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(runtimeDir, true);
    } else {
      // Tar.gz extraction on Unix
      execSync(`tar -xzf "${archivePath}" -C "${runtimeDir}"`);
    }

    if (fs.existsSync(archivePath)) {
      try { fs.unlinkSync(archivePath); } catch (e) {}
    }

    // Find the installed binary
    const subdirs = fs.readdirSync(runtimeDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const d of subdirs) {
      const cand = path.join(runtimeDir, d.name, 'bin', binaryName);
      if (fs.existsSync(cand)) {
        if (process.platform !== 'win32') {
          fs.chmodSync(cand, 0o755);
        }
        return cand;
      }
    }

    const directCand = path.join(runtimeDir, 'bin', binaryName);
    if (fs.existsSync(directCand)) {
      if (process.platform !== 'win32') {
        fs.chmodSync(directCand, 0o755);
      }
      return directCand;
    }

    throw new Error(`Impossible de trouver l'exécutable Java dans ${runtimeDir}`);
  }
}
