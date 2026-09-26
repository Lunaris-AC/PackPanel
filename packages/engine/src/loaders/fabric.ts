import { fetchJson } from '../utils/http.js';
import { MojangVersionJson, MojangLibrary } from '../mojang/version.js';

export const FABRIC_META_URL = 'https://meta.fabricmc.net/v2';

export interface FabricLoaderVersionEntry {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
    stable: boolean;
  };
  intermediary: {
    maven: string;
    version: string;
    stable: boolean;
  };
}

export class FabricLoaderResolver {
  /**
   * Fetches latest or available loader versions for a game version
   */
  static async getAvailableLoaders(gameVersion: string): Promise<FabricLoaderVersionEntry[]> {
    const url = `${FABRIC_META_URL}/versions/loader/${gameVersion}`;
    return fetchJson<FabricLoaderVersionEntry[]>(url);
  }

  /**
   * Resolves Fabric profile JSON and merges its libraries and mainClass into the Mojang version data
   */
  static async mergeFabricVersion(
    vanillaVersionData: MojangVersionJson,
    gameVersion: string,
    loaderVersion?: string
  ): Promise<MojangVersionJson> {
    let selectedVersion = loaderVersion;
    if (!selectedVersion) {
      const loaders = await this.getAvailableLoaders(gameVersion);
      if (loaders.length === 0) {
        throw new Error(`Aucune version de Fabric Loader disponible pour Minecraft ${gameVersion}`);
      }
      const stable = loaders.find(l => l.loader.stable) || loaders[0];
      selectedVersion = stable.loader.version;
    }

    const profileUrl = `${FABRIC_META_URL}/versions/loader/${gameVersion}/${selectedVersion}/profile/json`;
    const fabricProfile = await fetchJson<{
      id: string;
      mainClass: string;
      arguments?: {
        game?: any[];
        jvm?: any[];
      };
      libraries: Array<{
        name: string;
        url: string;
      }>;
    }>(profileUrl);

    // Convert Fabric libraries to MojangLibrary format
    const fabricLibs: MojangLibrary[] = fabricProfile.libraries.map(lib => ({
      name: lib.name,
      url: lib.url
    }));

    // Merge libraries (Fabric libraries first in classpath)
    const mergedLibraries = [...fabricLibs, ...vanillaVersionData.libraries];

    // Merge JVM and game arguments
    const mergedArgs = {
      jvm: [
        ...(vanillaVersionData.arguments?.jvm || []),
        ...(fabricProfile.arguments?.jvm || [])
      ],
      game: [
        ...(vanillaVersionData.arguments?.game || []),
        ...(fabricProfile.arguments?.game || [])
      ]
    };

    return {
      ...vanillaVersionData,
      id: fabricProfile.id,
      mainClass: fabricProfile.mainClass,
      libraries: mergedLibraries,
      arguments: mergedArgs
    };
  }
}
