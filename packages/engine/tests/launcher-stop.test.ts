import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MinecraftLauncher, type LaunchOptions } from '../src/launch/launcher.js';

const { spawn, closeWindowsGame } = vi.hoisted(() => ({ spawn: vi.fn(), closeWindowsGame: vi.fn() }));
vi.mock('child_process', () => ({ spawn }));
vi.mock('../src/launch/windows-close.js', () => ({ closeWindowsGame }));

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const options: LaunchOptions = {
  javaPath: 'java',
  gameDir: '/game',
  baseDir: '/shared',
  versionData: { id: '1.21.1' } as LaunchOptions['versionData'],
  classpath: [],
  clientJarPath: '/shared/client.jar',
  profile: { id: '069a79f444e93726a5befca90e38aaf5', name: 'Player', userType: 'offline', accessToken: '0' }
};

function launch() {
  const game = Object.assign(new EventEmitter(), {
    pid: 42,
    exitCode: null as number | null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn()
  });
  spawn.mockReturnValue(game);
  const launcher = new MinecraftLauncher();
  launcher.launch(options);
  return { game, launcher };
}

describe('Minecraft shutdown', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    closeWindowsGame.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => Object.defineProperty(process, 'platform', platform));

  it('requests a window close and reports a normal Windows exit', async () => {
    const { launcher, game } = launch();
    const exit = vi.fn();
    launcher.on('exit', exit);
    await launcher.kill();
    expect(closeWindowsGame).toHaveBeenCalledWith(game.pid);
    expect(game.kill).not.toHaveBeenCalled();
    game.emit('close', 0, null);
    expect(exit).toHaveBeenCalledOnce();
  });

  it('lets the user retry when Minecraft does not accept a window close', async () => {
    const { launcher, game } = launch();
    closeWindowsGame.mockRejectedValueOnce(new Error('No game window yet'));
    await expect(launcher.kill()).rejects.toThrow('PACKPANEL_STOP_UNAVAILABLE');
    await expect(launcher.kill()).resolves.toBeUndefined();
    expect(game.kill).not.toHaveBeenCalled();
  });

  it('still reports a nonzero exit during a Windows stop', async () => {
    const { launcher, game } = launch();
    const crash = vi.fn();
    launcher.on('crash', crash);
    closeWindowsGame.mockImplementationOnce(async () => {
      game.exitCode = 1;
      game.emit('close', 1, null);
      throw new Error('Game exited before the window request');
    });
    await expect(launcher.kill()).resolves.toBeUndefined();
    expect(crash).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 1 }));
  });
});
