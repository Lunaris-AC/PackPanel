import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { downloadFile } from '../utils/http.js';
import { MojangVersionJson, MojangLibrary } from '../mojang/version.js';

export const NEOFORGE_MAVEN_URL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge';

export class NeoForgeLoaderResolver {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async mergeNeoForgeVersion(
    vanillaVersionData: MojangVersionJson,
    gameVersion: string,
    neoForgeVersion: string
  ): Promise<MojangVersionJson> {
    const installerFileName = `neoforge-${neoForgeVersion}-installer.jar`;
    const installerUrl = `${NEOFORGE_MAVEN_URL}/${neoForgeVersion}/${installerFileName}`;
    const installerCacheDir = path.join(this.baseDir, 'cache', 'installers');
    const installerPath = path.join(installerCacheDir, installerFileName);

    if (!fs.existsSync(installerCacheDir)) {
      fs.mkdirSync(installerCacheDir, { recursive: true });
    }

    if (!fs.existsSync(installerPath)) {
      await downloadFile(installerUrl, installerPath);
    }

    const zip = new AdmZip(installerPath);
    const versionJsonEntry = zip.getEntry('version.json');
    if (!versionJsonEntry) {
      throw new Error(`Le fichier version.json est absent de l'installeur NeoForge : ${installerFileName}`);
    }

    const neoForgeJson = JSON.parse(versionJsonEntry.getData().toString('utf8')) as MojangVersionJson;

    const mergedLibs: MojangLibrary[] = [
      ...neoForgeJson.libraries,
      ...vanillaVersionData.libraries
    ];

    const seenNames = new Set<string>();
    const deduplicatedLibs: MojangLibrary[] = [];
    for (const lib of mergedLibs) {
      const baseName = lib.name.split(':').slice(0, 2).join(':');
      if (!seenNames.has(baseName)) {
        seenNames.add(baseName);
        deduplicatedLibs.push(lib);
      }
    }

    return {
      ...vanillaVersionData,
      id: neoForgeJson.id || `neoforge-${neoForgeVersion}`,
      mainClass: neoForgeJson.mainClass,
      libraries: deduplicatedLibs,
      arguments: {
        jvm: [
          ...(vanillaVersionData.arguments?.jvm || []),
          ...(neoForgeJson.arguments?.jvm || [])
        ],
        game: [
          ...(vanillaVersionData.arguments?.game || []),
          ...(neoForgeJson.arguments?.game || [])
        ]
      }
    };
  }
}
