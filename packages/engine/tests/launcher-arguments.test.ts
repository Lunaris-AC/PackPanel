import { describe, it, expect } from 'vitest';
import { MinecraftLauncher } from '../src/launch/launcher.js';
import { AuthProfile } from '@packpanel/protocol';

describe('Engine: Minecraft Launcher Arguments Synthesis', () => {
  const launcher = new MinecraftLauncher();

  const mockProfile: AuthProfile = {
    id: '069a79f444e93726a5befca90e38aaf5',
    name: 'Notch',
    userType: 'offline',
    accessToken: 'test_token'
  };

  const mockVersionData: any = {
    id: '1.20.1',
    mainClass: 'net.minecraft.client.main.Main',
    assets: '1.20',
    assetIndex: { id: '5' },
    arguments: {
      jvm: ['-Dtest.prop=true']
    }
  };

  it('builds standard JVM and Game arguments accurately', () => {
    const args = launcher.buildArguments({
      javaPath: 'java',
      gameDir: '/games/mc1',
      baseDir: '/games/shared',
      versionData: mockVersionData,
      classpath: ['/games/shared/libraries/lib1.jar'],
      clientJarPath: '/games/shared/versions/1.20.1/1.20.1.jar',
      profile: mockProfile,
      minMemoryMb: 2048,
      maxMemoryMb: 6144,
      customJvmArgs: ['-XX:+UseG1GC']
    });

    // Check JVM args
    expect(args.jvmArgs).toContain('-Xms2048M');
    expect(args.jvmArgs).toContain('-Xmx6144M');
    expect(args.jvmArgs).toContain('-XX:+UseG1GC');
    expect(args.jvmArgs).toContain('-Dminecraft.launcher.brand=PackPanel');
    expect(args.jvmArgs).toContain('-cp');

    // Check main class
    expect(args.mainClass).toBe('net.minecraft.client.main.Main');

    // Check game args
    expect(args.gameArgs).toContain('--username');
    expect(args.gameArgs).toContain('Notch');
    expect(args.gameArgs).toContain('--version');
    expect(args.gameArgs).toContain('1.20.1');
    expect(args.gameArgs).toContain('--gameDir');
    expect(args.gameArgs).toContain('/games/mc1');
    expect(args.gameArgs).toContain('--uuid');
    expect(args.gameArgs).toContain(mockProfile.id);
  });

  it('includes server quick-connect arguments when manifest specifies server', () => {
    const args = launcher.buildArguments({
      javaPath: 'java',
      gameDir: '/games/mc1',
      baseDir: '/games/shared',
      versionData: mockVersionData,
      classpath: [],
      clientJarPath: '/client.jar',
      profile: mockProfile,
      manifest: {
        server: {
          address: 'play.packpanel.org',
          port: 25565
        }
      } as any
    });

    expect(args.gameArgs).toContain('--server');
    expect(args.gameArgs).toContain('play.packpanel.org');
    expect(args.gameArgs).toContain('--port');
    expect(args.gameArgs).toContain('25565');
  });
});
