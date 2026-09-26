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

export class MinecraftEngine extends EventEmitter {
  private baseDir: string;
  private mojang: MojangVersionResolver;
  private java: JavaRuntimeManager;
  private launcher: MinecraftLauncher;

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
  async launchInstance(options: {
    manifestUrl: string;
    gameDir: string;
    profile: AuthProfile;
    customJavaPath?: string;
    minMemoryMb?: number;
    maxMemoryMb?: number;
    customJvmArgs?: string[];
    windowWidth?: number;
    windowHeight?: number;
  }): Promise<void> {
    const notify = (step: EngineProgressEvent['step'], progress: number, message: string) => {
      this.emit('progress', { step, progress, message } as EngineProgressEvent);
    };

    // 1. Fetch manifest
    notify('resolving_version', 5, 'Récupération du manifeste de l\'instance...');
    const manifest = await InstanceSynchronizer.fetchManifest(options.manifestUrl);

    // 2. Synchronize pack files (mods, configs, etc.)
    notify('syncing_files', 15, 'Synchronisation des fichiers du modpack...');
    const synchronizer = new InstanceSynchronizer(options.gameDir);
    await synchronizer.sync(manifest, (current, total, file) => {
      const pct = Math.floor(15 + (current / (total || 1)) * 30);
      notify('syncing_files', pct, `Téléchargement : ${file} (${current}/${total})`);
    });

    // 3. Resolve Java Runtime
    notify('checking_java', 48, 'Vérification de l\'environnement Java...');
    const requiredJava = manifest.java?.majorVersion || getRecommendedJavaVersion(manifest.minecraftVersion);
    const javaExec = options.customJavaPath || await this.java.resolveJavaPath(requiredJava, (done, total) => {
      notify('downloading_java', 50, `Téléchargement de Java ${requiredJava} (${Math.round((done / total) * 100)}%)...`);
    });

    // 4. Resolve Mojang base version
    notify('resolving_version', 55, `Résolution de Minecraft ${manifest.minecraftVersion}...`);
    let versionData = await this.mojang.resolveVersion(manifest.minecraftVersion);

    // 5. Merge Mod Loader if specified
    if (manifest.loader) {
      notify('resolving_version', 60, `Configuration du loader ${manifest.loader.type}...`);
      if (manifest.loader.type === 'fabric') {
        versionData = await FabricLoaderResolver.mergeFabricVersion(versionData, manifest.minecraftVersion, manifest.loader.version);
      } else if (manifest.loader.type === 'quilt') {
        versionData = await QuiltLoaderResolver.mergeQuiltVersion(versionData, manifest.minecraftVersion, manifest.loader.version);
      } else if (manifest.loader.type === 'forge') {
        const forge = new ForgeLoaderResolver(this.baseDir);
        versionData = await forge.mergeForgeVersion(versionData, manifest.minecraftVersion, manifest.loader.version || '');
      } else if (manifest.loader.type === 'neoforge') {
        const neoforge = new NeoForgeLoaderResolver(this.baseDir);
        versionData = await neoforge.mergeNeoForgeVersion(versionData, manifest.minecraftVersion, manifest.loader.version || '');
      }
    }

    // 6. Download client jar
    notify('downloading_assets', 65, 'Téléchargement du client Minecraft...');
    const clientJarPath = await this.mojang.downloadClientJar(versionData);

    // 7. Resolve and download libraries
    notify('downloading_assets', 75, 'Téléchargement des bibliothèques...');
    const classpath = await this.mojang.resolveLibraries(versionData, (index, total, name) => {
      const pct = Math.floor(75 + (index / total) * 15);
      notify('downloading_assets', pct, `Bibliothèque (${index}/${total}) : ${path.basename(name)}`);
    });

    // 8. Download Minecraft assets
    notify('downloading_assets', 90, 'Vérification des textures et sons...');
    await this.mojang.resolveAssets(versionData);

    // 9. Launch Minecraft Process
    notify('launching', 98, 'Démarrage du processus Minecraft...');
    this.launcher.launch({
      javaPath: javaExec,
      gameDir: options.gameDir,
      baseDir: this.baseDir,
      versionData,
      classpath,
      clientJarPath,
      profile: options.profile,
      manifest,
      minMemoryMb: options.minMemoryMb || 1024,
      maxMemoryMb: options.maxMemoryMb || manifest.java?.recommendedMemoryMb || 4096,
      customJvmArgs: options.customJvmArgs || manifest.java?.jvmArgs,
      windowWidth: options.windowWidth,
      windowHeight: options.windowHeight
    });

    notify('running', 100, 'Minecraft est en cours d\'exécution.');
  }

  /**
   * Stops the currently running instance.
   */
  stopInstance(): void {
    this.launcher.kill();
  }
}
