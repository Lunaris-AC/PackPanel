import { fetchMojangVersions, fetchMojangVersionDetail } from './providers/mojang';
import { fetchFabricLoaderVersions, isFabricAvailableForMinecraft } from './providers/fabric';
import { fetchQuiltLoaderVersions, isQuiltAvailableForMinecraft } from './providers/quilt';
import { fetchNeoForgeLoaderVersions, isNeoForgeAvailableForMinecraft } from './providers/neoforge';
import { fetchForgeLoaderVersions, isForgeAvailableForMinecraft } from './providers/forge';
import {
  LoaderType,
  LoaderCompatibilitySummary,
  LoaderVersionEntry,
  JavaRequirement,
  MinecraftVersionSummary
} from './types';

/**
 * Resolves Java requirements from official Mojang metadata package with loader constraints
 * and explicit historical fallbacks.
 */
export async function resolveJavaRequirement(
  minecraftVersion: string,
  loader: LoaderType,
  loaderVersion?: string
): Promise<JavaRequirement> {
  let majorVersion: number | null = null;
  let source: JavaRequirement['source'] = 'legacy_heuristic';

  // 1. Try to fetch official Mojang version JSON for javaVersion
  try {
    const mojang = await fetchMojangVersions();
    const vMeta = mojang.versions.find(v => v.id === minecraftVersion);
    if (vMeta) {
      const detail = await fetchMojangVersionDetail(vMeta.url, vMeta.id);
      if (detail && detail.javaVersion && typeof detail.javaVersion.majorVersion === 'number') {
        majorVersion = detail.javaVersion.majorVersion;
        source = 'mojang_manifest';
      }
    }
  } catch (e) {
    // Upstream unavailable or network error, proceed to fallback
  }

  // 2. Fallback heuristic for historical Minecraft versions
  if (majorVersion === null) {
    const match = minecraftVersion.match(/^1\.(\d+)(?:\.(\d+))?$/);
    if (match) {
      const minor = parseInt(match[1], 10);
      const patch = match[2] ? parseInt(match[2], 10) : 0;

      if (minor >= 21 || (minor === 20 && patch >= 5)) {
        majorVersion = 21;
      } else if (minor >= 18) {
        majorVersion = 17;
      } else if (minor === 17) {
        majorVersion = 16;
      } else {
        // 1.16.5 and all legacy versions (1.12.2, 1.7.10, etc.)
        majorVersion = 8;
      }
    } else {
      majorVersion = 17;
    }
    source = 'legacy_heuristic';
  }

  // 3. Loader constraints override (e.g. NeoForge 20.5+ requires Java 21)
  if (loader === 'neoforge') {
    if (loaderVersion) {
      const neoforgeMajor = parseInt(loaderVersion.split('.')[0], 10);
      const neoforgeMinor = parseInt(loaderVersion.split('.')[1] || '0', 10);
      if (neoforgeMajor >= 21 || (neoforgeMajor === 20 && neoforgeMinor >= 5)) {
        if (majorVersion < 21) {
          majorVersion = 21;
          source = 'loader_constraint';
        }
      }
    }
  }

  // 4. Memory recommendations and default JVM flags
  const recommendedMemoryMb = loader === 'vanilla' ? 2048 : 4096;
  const xms = '2G';
  const xmx = `${Math.round(recommendedMemoryMb / 1024)}G`;
  const jvmArgs = [`-Xms${xms}`, `-Xmx${xmx}`, '-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC'];

  return {
    majorVersion,
    recommendedMemoryMb,
    jvmArgs,
    source
  };
}

/**
 * Returns available loaders for a given Minecraft version.
 */
export async function getAvailableLoadersForMinecraft(
  minecraftVersion: string
): Promise<LoaderCompatibilitySummary[]> {
  const [fabricAvail, quiltAvail, neoAvail, forgeAvail] = await Promise.all([
    isFabricAvailableForMinecraft(minecraftVersion).catch(() => false),
    isQuiltAvailableForMinecraft(minecraftVersion).catch(() => false),
    isNeoForgeAvailableForMinecraft(minecraftVersion).catch(() => false),
    isForgeAvailableForMinecraft(minecraftVersion).catch(() => false)
  ]);

  const loaders: LoaderCompatibilitySummary[] = [
    {
      loader: 'vanilla',
      displayName: 'Vanilla (Sans loader)',
      available: true,
      supportState: 'engine_tested',
      notes: 'Client officiel Mojang sans modification'
    },
    {
      loader: 'fabric',
      displayName: 'Fabric',
      available: fabricAvail,
      supportState: fabricAvail ? 'engine_tested' : 'upstream_available',
      notes: 'Mod loader léger et modulaire'
    },
    {
      loader: 'quilt',
      displayName: 'Quilt',
      available: quiltAvail,
      supportState: quiltAvail ? 'engine_supported' : 'upstream_available',
      notes: 'Fork communautaire de Fabric avec rétro-compatibilité'
    },
    {
      loader: 'neoforge',
      displayName: 'NeoForge',
      available: neoAvail,
      supportState: neoAvail ? 'engine_tested' : 'upstream_available',
      notes: 'Successeur moderne de Forge (MC 1.20.1+)'
    },
    {
      loader: 'forge',
      displayName: 'Minecraft Forge',
      available: forgeAvail,
      supportState: forgeAvail ? 'engine_tested' : 'upstream_available',
      notes: 'Loader historique pour grands modpacks'
    }
  ];

  return loaders;
}

/**
 * Returns list of exact loader versions for a specific Minecraft version and loader.
 */
export async function getLoaderVersions(
  loader: LoaderType,
  minecraftVersion: string
): Promise<LoaderVersionEntry[]> {
  if (loader === 'vanilla') {
    return [];
  }

  switch (loader) {
    case 'fabric':
      return await fetchFabricLoaderVersions(minecraftVersion);
    case 'quilt':
      return await fetchQuiltLoaderVersions(minecraftVersion);
    case 'neoforge':
      return await fetchNeoForgeLoaderVersions(minecraftVersion);
    case 'forge':
      return await fetchForgeLoaderVersions(minecraftVersion);
    default:
      return [];
  }
}

/**
 * Validates a Minecraft + loader + loaderVersion combination.
 */
export async function validateCombination(
  minecraftVersion: string,
  loader: LoaderType,
  loaderVersion?: string
): Promise<{
  valid: boolean;
  resolvedLoaderVersion?: string;
  javaRequirement: JavaRequirement;
  error?: string;
}> {
  // 1. Verify Minecraft version exists
  const mojang = await fetchMojangVersions();
  const mcExists = mojang.versions.some(v => v.id === minecraftVersion);
  if (!mcExists) {
    const javaRequirement = await resolveJavaRequirement(minecraftVersion, loader, loaderVersion);
    return {
      valid: false,
      error: `Version Minecraft "${minecraftVersion}" introuvable dans le catalogue Mojang.`,
      javaRequirement
    };
  }

  // 2. If vanilla, loaderVersion must be empty
  if (loader === 'vanilla') {
    const javaRequirement = await resolveJavaRequirement(minecraftVersion, loader);
    return {
      valid: true,
      resolvedLoaderVersion: undefined,
      javaRequirement
    };
  }

  // 3. For modded loaders, check compatibility
  const versions = await getLoaderVersions(loader, minecraftVersion);
  if (versions.length === 0) {
    const javaRequirement = await resolveJavaRequirement(minecraftVersion, loader, loaderVersion);
    return {
      valid: false,
      error: `Le loader "${loader}" n'est pas disponible pour Minecraft ${minecraftVersion}.`,
      javaRequirement
    };
  }

  // 4. Resolve exact loader version
  let resolvedVersion = loaderVersion;
  if (!resolvedVersion || resolvedVersion === 'latest' || resolvedVersion === 'recommended') {
    const recommended = versions.find(v => v.isRecommended) || versions[0];
    resolvedVersion = recommended.version;
  } else {
    const exists = versions.some(v => v.version === resolvedVersion);
    if (!exists) {
      const javaRequirement = await resolveJavaRequirement(minecraftVersion, loader, loaderVersion);
      return {
        valid: false,
        error: `La version "${resolvedVersion}" du loader ${loader} n'est pas compatible avec Minecraft ${minecraftVersion}.`,
        javaRequirement
      };
    }
  }

  const javaRequirement = await resolveJavaRequirement(minecraftVersion, loader, resolvedVersion);

  return {
    valid: true,
    resolvedLoaderVersion: resolvedVersion,
    javaRequirement
  };
}
