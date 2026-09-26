import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { AuthProfile, InstanceManifestV2 } from '@packpanel/protocol';
import { MojangVersionJson } from '../mojang/version.js';

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

    // 1. JVM Arguments
    const jvmArgs: string[] = [
      `-Xms${minMemoryMb}M`,
      `-Xmx${maxMemoryMb}M`,
      `-Djava.library.path=${nativesDir}`,
      `-Dminecraft.launcher.brand=PackPanel`,
      `-Dminecraft.launcher.version=2.0`
    ];

    // Add versionData JVM args if present
    if (versionData.arguments?.jvm) {
      for (const arg of versionData.arguments.jvm) {
        if (typeof arg === 'string') {
          // Replace placeholders
          const substituted = arg
            .replace('${natives_directory}', nativesDir)
            .replace('${launcher_name}', 'PackPanel')
            .replace('${launcher_version}', '2.0')
            .replace('${classpath}', '');
          if (substituted && !substituted.includes('${')) {
            jvmArgs.push(substituted);
          }
        }
      }
    }

    // Add custom user / instance JVM args
    for (const customArg of customJvmArgs) {
      if (customArg && !jvmArgs.includes(customArg)) {
        jvmArgs.push(customArg);
      }
    }

    // Full Classpath
    const fullClasspath = [...classpath, clientJarPath].join(pathSeparator);
    jvmArgs.push('-cp', fullClasspath);

    // 2. Main Class
    const mainClass = versionData.mainClass || 'net.minecraft.client.main.Main';

    // 3. Game Arguments
    const gameArgs: string[] = [];

    if (versionData.minecraftArguments) {
      // Legacy argument template (1.12 and earlier)
      const legacyArgs = versionData.minecraftArguments
        .replace('${auth_player_name}', profile.name)
        .replace('${version_name}', versionData.id)
        .replace('${game_directory}', gameDir)
        .replace('${assets_root}', assetsDir)
        .replace('${game_assets}', assetsDir)
        .replace('${assets_index_name}', versionData.assetIndex?.id || 'legacy')
        .replace('${auth_uuid}', profile.id)
        .replace('${auth_access_token}', profile.accessToken)
        .replace('${user_type}', profile.userType === 'microsoft' ? 'msa' : 'legacy')
        .replace('${version_type}', 'PackPanel')
        .split(' ');
      gameArgs.push(...legacyArgs);
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
    if (options.windowWidth && options.windowHeight) {
      gameArgs.push('--width', String(options.windowWidth), '--height', String(options.windowHeight));
    }

    // Server quick-connect if specified in manifest
    if (manifest?.server?.address) {
      gameArgs.push('--server', manifest.server.address);
      if (manifest.server.port) {
        gameArgs.push('--port', String(manifest.server.port));
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
      if (code !== 0 && code !== null) {
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
      this.process.kill();
    }
  }
}
