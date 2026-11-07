export * from './mojang/version.js';
export * from './loaders/fabric.js';
export * from './loaders/quilt.js';
export * from './loaders/forge.js';
export * from './loaders/neoforge.js';
export * from './java/runtime.js';
export * from './auth/offline.js';
export * from './auth/microsoft.js';
export * from './sync/synchronizer.js';
export * from './launch/launcher.js';
export * from './utils/http.js';
export * from './utils/hasher.js';
export * from './utils/platform.js';
export * from './utils/arguments.js';

import path from 'path';
import { EventEmitter } from 'events';
import { AuthProfile, InstanceManifestV2, EngineProgressEvent } from '@packpanel/protocol';
import { MojangVersionResolver, MojangVersionJson } from './mojang/version.js';
import { FabricLoaderResolver } from './loaders/fabric.js';
import { QuiltLoaderResolver } from './loaders/quilt.js';
import { ForgeLoaderResolver } from './loaders/forge.js';
import { NeoForgeLoaderResolver } from './loaders/neoforge.js';
import { JavaRuntimeManager, getRecommendedJavaVersion } from './java/runtime.js';
import { InstanceSynchronizer } from './sync/synchronizer.js';
import { MinecraftLauncher } from './launch/launcher.js';

export interface EngineConfig {
  baseDir: string;
}

interface PrepareOptions {
  manifestUrl: string;
  gameDir: string;
  customJavaPath?: string;
  optionalFiles?: Record<string, boolean>;
}

interface EngineLaunchOptions extends PrepareOptions {
  profile: AuthProfile;
  minMemoryMb?: number;
  maxMemoryMb?: number;
  customJvmArgs?: string[];
  windowWidth?: number;
  windowHeight?: number;
  beforeLaunch?: () => Promise<void>;
}

export class MinecraftEngine extends EventEmitter {
  private baseDir: string;
  private mojang: MojangVersionResolver;
  private java: JavaRuntimeManager;
  private launcher: MinecraftLauncher;
  private preparation: AbortController | null = null;

  constructor(config: EngineConfig) {
    super();
    this.baseDir = config.baseDir;
    this.mojang = new MojangVersionResolver(this.baseDir);
    this.java = new JavaRuntimeManager(this.baseDir);
    this.launcher = new MinecraftLauncher();

    // Bubble launcher events
    this.launcher.on('log', (line) => this.emit('log', line));
    this.launcher.on('crash', (data) => this.emit('crash', data));
    this.launcher.on('exit', (data) => this.emit('exit', data));
    this.launcher.on('error', (err) => this.emit('error', err));
  }

  /**
   * Orchestrates the complete preparation and launch of a Minecraft instance.
   */
  async launchInstance(options: EngineLaunchOptions): Promise<void> {
    await this.runInstance(options, options);
  }

  async prepareInstance(options: PrepareOptions): Promise<void> {
    await this.runInstance(options);
  }

  private async runInstance(options: PrepareOptions, launch?: EngineLaunchOptions): Promise<void> {
    if (this.preparation) throw new Error('Une instance est déjà en cours de préparation.');
    const preparation = new AbortController();
    this.preparation = preparation;
    const { signal } = preparation;
    const notify = (step: EngineProgressEvent['step'], progress: number, message: string) => {
      if (signal.aborted) return;
      this.emit('progress', { step, progress, message } as EngineProgressEvent);
    };
    try {
    // 1. Fetch manifest
    notify('resolving_version', 5, 'Récupération du manifeste de l\'instance...');
    const manifest = await InstanceSynchronizer.fetchManifest(options.manifestUrl, signal).catch(error => {
      throw new Error(`PACKPANEL_MANIFEST_UNAVAILABLE: ${error.message}`, { cause: error });
    });
    signal.throwIfAborted();

    // 2. Synchronize pack files (mods, configs, etc.)
    notify('syncing_files', 15, 'Synchronisation des fichiers du modpack...');
    const synchronizer = new InstanceSynchronizer(options.gameDir);
    await synchronizer.sync(manifest, (current, total, file) => {
      const pct = Math.floor(15 + (current / (total || 1)) * 30);
      notify('syncing_files', pct, `Téléchargement : ${file} (${current}/${total})`);
    }, 4, { signal, optionalFiles: options.optionalFiles });
    signal.throwIfAborted();

    // 3. Resolve Java Runtime
    notify('checking_java', 48, 'Vérification de l\'environnement Java...');
    const requiredJava = manifest.java?.majorVersion || getRecommendedJavaVersion(manifest.minecraftVersion);
    const javaExec = options.customJavaPath || await this.java.resolveJavaPath(requiredJava, (done, total) => {
      const progress = total ? Math.min(1, done / total) : 0;
      notify('downloading_java', 48 + progress * 7, `Téléchargement de Java ${requiredJava}...`);
    });
    signal.throwIfAborted();

    // 4. Resolve Mojang base version
    notify('resolving_version', 55, `Résolution de Minecraft ${manifest.minecraftVersion}...`);
    let versionData = await this.mojang.resolveVersion(manifest.minecraftVersion);
    signal.throwIfAborted();

    // 5. Merge Mod Loader if specified
    if (manifest.loader) {
      notify('resolving_version', 60, `Configuration du loader ${manifest.loader.type}...`);
      if (manifest.loader.type === 'fabric') {
        versionData = await FabricLoaderResolver.mergeFabricVersion(versionData, manifest.minecraftVersion, manifest.loader.version);
      } else if (manifest.loader.type === 'quilt') {
        versionData = await QuiltLoaderResolver.mergeQuiltVersion(versionData, manifest.minecraftVersion, manifest.loader.version);
      } else if (manifest.loader.type === 'forge') {
        const forge = new ForgeLoaderResolver(this.baseDir);
        versionData = await forge.mergeForgeVersion(versionData, manifest.minecraftVersion, manifest.loader.version || '', javaExec);
      } else if (manifest.loader.type === 'neoforge') {
        const neoforge = new NeoForgeLoaderResolver(this.baseDir);
        versionData = await neoforge.mergeNeoForgeVersion(versionData, manifest.minecraftVersion, manifest.loader.version || '', javaExec);
      }
    }
    signal.throwIfAborted();

    // 6. Download client jar
    notify('downloading_assets', 65, 'Téléchargement du client Minecraft...');
    const clientJarPath = await this.mojang.downloadClientJar(versionData);
    signal.throwIfAborted();

    // 7. Resolve and download libraries
    notify('downloading_assets', 75, 'Téléchargement des bibliothèques...');
    const classpath = await this.mojang.resolveLibraries(versionData, (index, total, name) => {
      const pct = Math.floor(75 + (index / total) * 15);
      notify('downloading_assets', pct, `Bibliothèque (${index}/${total}) : ${path.basename(name)}`);
    });
    signal.throwIfAborted();

    // 8. Download Minecraft assets
    notify('downloading_assets', 90, 'Vérification des textures et sons...');
    await this.mojang.resolveAssets(versionData, (done, total) => {
      notify('downloading_assets', Math.floor(90 + (done / (total || 1)) * 7), `Textures et sons (${done}/${total})...`);
    });

    // 9. Launch Minecraft Process
    signal.throwIfAborted();
    this.emit('packReady', manifest);
    if (!launch) {
      notify('prepared', 100, 'Les fichiers du jeu sont prêts.');
      return;
    }
    await launch.beforeLaunch?.();
    signal.throwIfAborted();
    this.preparation = null;
    notify('launching', 98, 'Démarrage du processus Minecraft...');
    this.launcher.launch({
      javaPath: javaExec,
      gameDir: options.gameDir,
      baseDir: this.baseDir,
      versionData,
      classpath,
      clientJarPath,
      profile: launch.profile,
      manifest,
      minMemoryMb: launch.minMemoryMb || 1024,
      maxMemoryMb: launch.maxMemoryMb || manifest.java?.recommendedMemoryMb || 4096,
      customJvmArgs: [...(manifest.java?.jvmArgs || []), ...(launch.customJvmArgs || [])],
      windowWidth: launch.windowWidth,
      windowHeight: launch.windowHeight
    });

    notify('running', 100, 'Minecraft est en cours d\'exécution.');
    } catch (error) {
      if (signal.aborted) this.emit('exit', { exitCode: 0 });
      else throw error;
    } finally { if (this.preparation === preparation) this.preparation = null; }
  }

  /**
   * Stops the currently running instance.
   */
  stopInstance(): Promise<void> {
    if (this.preparation && !this.preparation.signal.aborted) {
      this.preparation.abort();
      this.emit('progress', { step: 'idle', progress: 0, message: 'Arrêt en cours de la préparation...' });
    }
    return this.launcher.kill();
  }
}
