import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { AuthProfile, InstanceManifestV2 } from '@packpanel/protocol';
import { MojangVersionJson } from '../mojang/version.js';
import { evaluateRules } from '../utils/platform.js';

export interface LaunchOptions {
  javaPath: string;
  gameDir: string;
  baseDir: string;
  versionData: MojangVersionJson;
  classpath: string[];
  clientJarPath: string;
  profile: AuthProfile;
  manifest?: InstanceManifestV2;
  minMemoryMb?: number;
  maxMemoryMb?: number;
  customJvmArgs?: string[];
  windowWidth?: number;
  windowHeight?: number;
}

export class MinecraftLauncher extends EventEmitter {
  private process: ChildProcess | null = null;
  private stopping = false;

  /**
   * Builds the complete list of JVM and Game arguments for launching Minecraft
   */
  buildArguments(options: LaunchOptions): { jvmArgs: string[]; gameArgs: string[]; mainClass: string } {
    const {
      gameDir,
      baseDir,
      versionData,
      classpath,
      clientJarPath,
      profile,
      manifest,
      minMemoryMb = 1024,
      maxMemoryMb = 4096,
      customJvmArgs = []
    } = options;

    const nativesDir = path.join(baseDir, 'natives', versionData.id);
    const assetsDir = path.join(baseDir, 'assets');
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const fullClasspath = [...classpath, clientJarPath].join(pathSeparator);
    const serverAddress = manifest?.server?.address;
    const placeholders: Record<string, string> = {
      natives_directory: nativesDir, launcher_name: 'PackPanel', launcher_version: '2.0',
      classpath: fullClasspath, classpath_separator: pathSeparator, library_directory: path.join(baseDir, 'libraries'),
      auth_player_name: profile.name, version_name: versionData.id, game_directory: gameDir,
      assets_root: assetsDir, game_assets: path.join(assetsDir, 'virtual', 'legacy'), assets_index_name: versionData.assetIndex?.id || versionData.assets || 'legacy',
      auth_uuid: profile.id, auth_access_token: profile.accessToken, user_type: profile.userType === 'microsoft' ? 'msa' : 'legacy',
      version_type: 'PackPanel', user_properties: '{}', auth_xuid: '', clientid: '',
      resolution_width: String(options.windowWidth || 1280), resolution_height: String(options.windowHeight || 720),
      quickPlayMultiplayer: serverAddress ? serverAddress + (manifest?.server?.port ? ':' + manifest.server.port : '') : ''
    };
    const features = { has_custom_resolution: Boolean(options.windowWidth && options.windowHeight), is_quick_play_multiplayer: Boolean(serverAddress) };
    const substitute = (value: string) => value.replace(/\$\{([^}]+)\}/g, (match, key) => {
      if (placeholders[key] === undefined) throw new Error(`Argument Minecraft inconnu: ${match}`);
      return placeholders[key];
    });
    const expand = (args: NonNullable<MojangVersionJson['arguments']>['game'] = []) => args.flatMap(arg => {
      if (typeof arg === 'string') return [substitute(arg)];
      if (!evaluateRules(arg.rules, features)) return [];
      return (Array.isArray(arg.value) ? arg.value : [arg.value]).map(substitute);
    });

    // 1. JVM Arguments
    const jvmArgs: string[] = [
      `-Xms${Math.min(minMemoryMb, maxMemoryMb)}M`,
      `-Xmx${maxMemoryMb}M`,
      `-Djava.library.path=${nativesDir}`,
      `-Dminecraft.launcher.brand=PackPanel`,
      `-Dminecraft.launcher.version=2.0`
    ];

    // Add versionData JVM args if present
    jvmArgs.push(...expand(versionData.arguments?.jvm));

    // Add custom user / instance JVM args
    for (const customArg of customJvmArgs) {
      if (customArg && !/^-Xm[sx]/.test(customArg) && !jvmArgs.includes(customArg)) {
        jvmArgs.push(customArg);
      }
    }

    // Full Classpath
    if (!jvmArgs.includes('-cp') && !jvmArgs.includes('-classpath')) jvmArgs.push('-cp', fullClasspath);

    // 2. Main Class
    const mainClass = versionData.mainClass || 'net.minecraft.client.main.Main';

    // 3. Game Arguments
    const gameArgs: string[] = [];

    if (versionData.minecraftArguments) {
      // Legacy argument template (1.12 and earlier)
      const legacyArgs = versionData.minecraftArguments.split(' ').map(substitute);
      gameArgs.push(...legacyArgs);
    } else if (versionData.arguments?.game?.length) {
      gameArgs.push(...expand(versionData.arguments.game));
    } else {
      // Modern arguments
      gameArgs.push(
        '--username', profile.name,
        '--version', versionData.id,
        '--gameDir', gameDir,
        '--assetsDir', assetsDir,
        '--assetIndex', versionData.assetIndex?.id || versionData.assets || 'legacy',
        '--uuid', profile.id,
        '--accessToken', profile.accessToken,
        '--userType', profile.userType === 'microsoft' ? 'msa' : 'mojang',
        '--versionType', 'PackPanel'
      );
    }

    // Optional window dimensions
    if (options.windowWidth && options.windowHeight && !gameArgs.includes('--width')) {
      gameArgs.push('--width', String(options.windowWidth), '--height', String(options.windowHeight));
    }

    // Server quick-connect if specified in manifest
    if (serverAddress && !gameArgs.includes('--quickPlayMultiplayer')) {
      const modern = !versionData.minecraftArguments && !/^1\.(?:[0-9]|1[0-9])(?:\.|$)/.test(versionData.id);
      if (modern) gameArgs.push('--quickPlayMultiplayer', placeholders.quickPlayMultiplayer);
      else {
        const match = serverAddress.match(/^(.+):(\d+)$/);
        gameArgs.push('--server', match ? match[1] : serverAddress);
        const port = manifest?.server?.port || (match ? Number(match[2]) : undefined);
        if (port) gameArgs.push('--port', String(port));
      }
    }

    return { jvmArgs, gameArgs, mainClass };
  }

  /**
   * Launches Minecraft as a child process and attaches event listeners.
   */
  launch(options: LaunchOptions): ChildProcess {
    const { jvmArgs, gameArgs, mainClass } = this.buildArguments(options);
    const fullArgs = [...jvmArgs, mainClass, ...gameArgs];

    this.emit('launching', { command: options.javaPath, args: fullArgs });

    const proc = spawn(options.javaPath, fullArgs, {
      cwd: options.gameDir,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process = proc;
    this.stopping = false;

    proc.stdout.on('data', (data) => {
      const text = data.toString('utf8');
      this.emit('log', text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString('utf8');
      this.emit('log', text);
    });

    proc.on('error', (err) => {
      this.emit('error', err);
    });

    proc.on('close', (code, signal) => {
      this.process = null;
      if (code !== 0 && code !== null && !this.stopping) {
        // Check for latest crash report
        const crashDir = path.join(options.gameDir, 'crash-reports');
        let latestCrashContent: string | null = null;
        if (fs.existsSync(crashDir)) {
          const files = fs.readdirSync(crashDir)
            .filter(f => f.endsWith('.txt'))
            .map(f => ({ name: f, time: fs.statSync(path.join(crashDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);

          if (files.length > 0) {
            latestCrashContent = fs.readFileSync(path.join(crashDir, files[0].name), 'utf8');
          }
        }

        this.emit('crash', {
          exitCode: code,
          signal,
          crashReport: latestCrashContent
        });
      } else {
        this.emit('exit', { exitCode: 0, signal });
      }
    });

    return proc;
  }

  /**
   * Terminates the running Minecraft instance
   */
  kill(): void {
    if (this.process) {
      this.stopping = true;
      this.process.kill();
    }
  }
}
