import { fetchJson } from '../utils/http.js';
import { MojangVersionJson, MojangLibrary } from '../mojang/version.js';

export const QUILT_META_URL = 'https://meta.quiltmc.org/v3';

export interface QuiltLoaderVersionEntry {
  loader: {
    separator: string;
    build: number;
    maven: string;
    version: string;
  };
  hashed: {
    maven: string;
    version: string;
  };
}

export class QuiltLoaderResolver {
  static async getAvailableLoaders(gameVersion: string): Promise<QuiltLoaderVersionEntry[]> {
    const url = `${QUILT_META_URL}/versions/loader/${gameVersion}`;
    return fetchJson<QuiltLoaderVersionEntry[]>(url);
  }

  static async mergeQuiltVersion(
    vanillaVersionData: MojangVersionJson,
    gameVersion: string,
    loaderVersion?: string
  ): Promise<MojangVersionJson> {
    let selectedVersion = loaderVersion;
    if (!selectedVersion) {
      const loaders = await this.getAvailableLoaders(gameVersion);
      if (loaders.length === 0) {
        throw new Error(`Aucune version de Quilt Loader disponible pour Minecraft ${gameVersion}`);
      }
      selectedVersion = loaders[0].loader.version;
    }

    const profileUrl = `${QUILT_META_URL}/versions/loader/${gameVersion}/${selectedVersion}/profile/json`;
    const quiltProfile = await fetchJson<{
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

    const quiltLibs: MojangLibrary[] = quiltProfile.libraries.map(lib => ({
      name: lib.name,
      url: lib.url
    }));

    return {
      ...vanillaVersionData,
      id: quiltProfile.id,
      mainClass: quiltProfile.mainClass,
      libraries: [...quiltLibs, ...vanillaVersionData.libraries],
      arguments: {
        jvm: [
          ...(vanillaVersionData.arguments?.jvm || []),
          ...(quiltProfile.arguments?.jvm || [])
        ],
        game: [
          ...(vanillaVersionData.arguments?.game || []),
          ...(quiltProfile.arguments?.game || [])
        ]
      }
    };
  }
}
