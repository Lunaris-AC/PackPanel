import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { downloadFile } from '../utils/http.js';
import { MojangVersionJson, MojangLibrary } from '../mojang/version.js';

export const FORGE_MAVEN_URL = 'https://maven.minecraftforge.net/net/minecraftforge/forge';

export interface ForgeInstallProfile {
  spec?: number;
  profile?: string;
  version: string;
  json?: string;
  path?: string;
  minecraft: string;
  data?: Record<string, { client: string; server: string }>;
  processors?: Array<{
    sides?: string[];
    jar: string;
    classpath: string[];
    args: string[];
    outputs?: Record<string, string>;
  }>;
  libraries: MojangLibrary[];
}

export class ForgeLoaderResolver {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Resolves Forge installer, extracts version.json, and merges with vanilla version data.
   */
  async mergeForgeVersion(
    vanillaVersionData: MojangVersionJson,
    gameVersion: string,
    forgeVersion: string
  ): Promise<MojangVersionJson> {
    const installerFileName = `forge-${gameVersion}-${forgeVersion}-installer.jar`;
    const installerUrl = `${FORGE_MAVEN_URL}/${gameVersion}-${forgeVersion}/${installerFileName}`;
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
      throw new Error(`Le fichier version.json est absent de l'installeur Forge : ${installerFileName}`);
    }

    const forgeVersionJson = JSON.parse(versionJsonEntry.getData().toString('utf8')) as MojangVersionJson;

    // Merge libraries: Forge libraries first, then vanilla libraries
    const mergedLibs: MojangLibrary[] = [
      ...forgeVersionJson.libraries,
      ...vanillaVersionData.libraries
    ];

    // Deduplicate libraries by name
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
      id: forgeVersionJson.id || `forge-${gameVersion}-${forgeVersion}`,
      mainClass: forgeVersionJson.mainClass,
      libraries: deduplicatedLibs,
      arguments: {
        jvm: [
          ...(vanillaVersionData.arguments?.jvm || []),
          ...(forgeVersionJson.arguments?.jvm || [])
        ],
        game: [
          ...(vanillaVersionData.arguments?.game || []),
          ...(forgeVersionJson.arguments?.game || [])
        ]
      }
    };
  }
}
