import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fetchJson, downloadFile } from '../utils/http.js';
import { evaluateRules, getCurrentMojangOs, mavenToPath } from '../utils/platform.js';

export const PISTON_VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
export const MOJANG_ASSET_BASE_URL = 'https://resources.download.minecraft.net';

export interface VersionManifestEntry {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
}

export interface VersionManifestResponse {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: VersionManifestEntry[];
}

export interface MojangLibraryDownload {
  path: string;
  sha1: string;
  size: number;
  url: string;
}

export interface MojangLibrary {
  name: string;
  downloads?: {
    artifact?: MojangLibraryDownload;
    classifiers?: Record<string, MojangLibraryDownload>;
  };
  natives?: Record<string, string>;
  rules?: any[];
  url?: string; // Maven repo base
}

export interface MojangVersionJson {
  id: string;
  mainClass: string;
  arguments?: {
    game?: Array<string | { rules: any[]; value: string | string[] }>;
    jvm?: Array<string | { rules: any[]; value: string | string[] }>;
  };
  minecraftArguments?: string;
  assetIndex: {
    id: string;
    sha1: string;
    size: number;
    totalSize: number;
    url: string;
  };
  assets: string;
  downloads: {
    client: {
      sha1: string;
      size: number;
      url: string;
    };
  };
  libraries: MojangLibrary[];
  javaVersion?: {
    component: string;
    majorVersion: number;
  };
}

export class MojangVersionResolver {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Resolves the version JSON from Mojang piston-meta and caches it locally.
   */
  async resolveVersion(versionId: string): Promise<MojangVersionJson> {
    const versionDir = path.join(this.baseDir, 'versions', versionId);
    const versionJsonPath = path.join(versionDir, `${versionId}.json`);

    if (fs.existsSync(versionJsonPath)) {
      try {
        const raw = fs.readFileSync(versionJsonPath, 'utf8');
        return JSON.parse(raw) as MojangVersionJson;
      } catch (e) {
        // Re-fetch if corrupt
      }
    }

    const manifest = await fetchJson<VersionManifestResponse>(PISTON_VERSION_MANIFEST_URL);
    const entry = manifest.versions.find(v => v.id === versionId);
    if (!entry) {
      throw new Error(`Version Minecraft introuvable dans le catalogue officiel : ${versionId}`);
    }

    const versionData = await fetchJson<MojangVersionJson>(entry.url);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }
    fs.writeFileSync(versionJsonPath, JSON.stringify(versionData, null, 2), 'utf8');
    return versionData;
  }

  /**
   * Downloads client jar to <gameDir>/versions/<version>/<version>.jar
   */
  async downloadClientJar(versionData: MojangVersionJson, onProgress?: (done: number, total: number) => void): Promise<string> {
    const clientPath = path.join(this.baseDir, 'versions', versionData.id, `${versionData.id}.jar`);
    const clientDownload = versionData.downloads.client;

    await downloadFile(clientDownload.url, clientPath, {
      expectedSha1: clientDownload.sha1,
      expectedSize: clientDownload.size,
      onProgress
    });

    return clientPath;
  }

  /**
   * Resolves and downloads all required libraries for the current OS.
   * Returns array of absolute jar paths to include in the classpath.
   */
  async resolveLibraries(
    versionData: MojangVersionJson,
    onProgress?: (index: number, total: number, name: string) => void
  ): Promise<string[]> {
    const librariesDir = path.join(this.baseDir, 'libraries');
    const classpath: string[] = [];
    const currentOs = getCurrentMojangOs();

    const applicableLibs = versionData.libraries.filter(lib => evaluateRules(lib.rules));

    for (let i = 0; i < applicableLibs.length; i++) {
      const lib = applicableLibs[i];
      if (onProgress) onProgress(i + 1, applicableLibs.length, lib.name);

      // 1. Standard artifact download
      if (lib.downloads?.artifact) {
        const artifact = lib.downloads.artifact;
        const targetPath = path.join(librariesDir, artifact.path);
        if (!artifact.url) {
          if (!fs.existsSync(targetPath)) throw new Error(`Bibliothèque générée absente: ${lib.name}`);
          classpath.push(targetPath);
          continue;
        }
        await downloadFile(artifact.url, targetPath, {
          expectedSha1: artifact.sha1,
          expectedSize: artifact.size
        });
        classpath.push(targetPath);
      } else if (lib.url || lib.name) {
        // Fallback for custom / maven libraries (e.g. loaders)
        const relPath = mavenToPath(lib.name);
        const targetPath = path.join(librariesDir, relPath);
        if (!fs.existsSync(targetPath)) {
          const repoUrl = (lib.url || 'https://libraries.minecraft.net/').replace(/\/+$/, '');
          const downloadUrl = `${repoUrl}/${relPath}`;
          await downloadFile(downloadUrl, targetPath);
        }
        if (fs.existsSync(targetPath)) {
          classpath.push(targetPath);
        }
      }

      // 2. Native classifier for this OS
      if (lib.natives && lib.downloads?.classifiers) {
        const nativeKey = lib.natives[currentOs]?.replace('${arch}', process.arch === 'x64' ? '64' : '32');
        if (nativeKey && lib.downloads.classifiers[nativeKey]) {
          const nativeArtifact = lib.downloads.classifiers[nativeKey];
          const nativeJarPath = path.join(librariesDir, nativeArtifact.path);
          await downloadFile(nativeArtifact.url, nativeJarPath, {
            expectedSha1: nativeArtifact.sha1,
            expectedSize: nativeArtifact.size
          });
          // Extract natives to natives directory
          await this.extractNatives(nativeJarPath, versionData.id);
        }
      }
    }

    return classpath;
  }

  /**
   * Extracts native library archives (.dll, .so, .dylib) into <gameDir>/natives/<version>/
   */
  async extractNatives(jarPath: string, versionId: string): Promise<string> {
    const nativesDir = path.join(this.baseDir, 'natives', versionId);
    if (!fs.existsSync(nativesDir)) {
      fs.mkdirSync(nativesDir, { recursive: true });
    }

    const zip = new AdmZip(jarPath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory || entry.entryName.startsWith('META-INF')) {
        continue;
      }
      const ext = path.extname(entry.entryName).toLowerCase();
      if (['.dll', '.so', '.dylib', '.jnilib'].includes(ext)) {
        const dest = path.join(nativesDir, path.basename(entry.entryName));
        fs.writeFileSync(dest, entry.getData());
      }
    }

    return nativesDir;
  }

  /**
   * Resolves asset index and downloads all Minecraft sound/texture assets.
   */
  async resolveAssets(
    versionData: MojangVersionJson,
    onProgress?: (done: number, total: number) => void
  ): Promise<void> {
    const assetsDir = path.join(this.baseDir, 'assets');
    const indexesDir = path.join(assetsDir, 'indexes');
    const objectsDir = path.join(assetsDir, 'objects');

    if (!fs.existsSync(indexesDir)) fs.mkdirSync(indexesDir, { recursive: true });
    if (!fs.existsSync(objectsDir)) fs.mkdirSync(objectsDir, { recursive: true });

    const indexFile = path.join(indexesDir, `${versionData.assetIndex.id}.json`);
    await downloadFile(versionData.assetIndex.url, indexFile, {
      expectedSha1: versionData.assetIndex.sha1,
      expectedSize: versionData.assetIndex.size
    });

    const indexContent = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const objects = Object.values(indexContent.objects || {}) as Array<{ hash: string; size: number }>;

    const uniqueObjects = [...new Map(objects.map(object => [object.hash, object])).values()];
    let next = 0;
    let count = 0;
    await Promise.all(Array.from({ length: Math.min(12, uniqueObjects.length) }, async () => {
      while (next < uniqueObjects.length) {
        const obj = uniqueObjects[next++];
        if (!/^[a-f0-9]{40}$/.test(obj.hash)) throw new Error('Identifiant de ressource Minecraft invalide.');
        const prefix = obj.hash.substring(0, 2);
        const targetPath = path.join(objectsDir, prefix, obj.hash);
        await downloadFile(`${MOJANG_ASSET_BASE_URL}/${prefix}/${obj.hash}`, targetPath, {
          expectedSha1: obj.hash,
          expectedSize: obj.size
        });
        count++;
        if (count % 25 === 0) onProgress?.(count, uniqueObjects.length);
      }
    }));

    if (onProgress) onProgress(uniqueObjects.length, uniqueObjects.length);
  }
}
