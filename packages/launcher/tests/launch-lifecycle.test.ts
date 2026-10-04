import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), launch: vi.fn(), engine: null as any, offline: true, saved: '', openPath: vi.fn().mockResolvedValue('') }));
vi.mock('electron', () => ({
  app: { commandLine: { getSwitchValue: () => '' }, getPath: () => '/temporary-launcher-test', getAppPath: () => '/app', whenReady: () => new Promise(() => {}), on: vi.fn() },
  BrowserWindow: vi.fn(), ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) }, shell: { openExternal: vi.fn(), openPath: state.openPath }
}));
vi.mock('fs', () => ({ default: {
  existsSync: (p: string) => p.endsWith('launcher-config.json'), mkdirSync: vi.fn(),
  writeFileSync: (_path: string, contents: string) => { state.saved = contents; }, renameSync: vi.fn(),
  readFileSync: (p: string) => p.endsWith('settings.json') ? state.saved : JSON.stringify({ formatVersion: 2, launcherId: '11111111-1111-4111-8111-111111111111', name: 'Test', slug: 'test', template: 'minimal', branding: { title: 'Test', accentColor: '#123456' }, auth: { microsoft: false, offline: state.offline }, instances: [{ id: '22222222-2222-4222-8222-222222222222', slug: 'test-instance', name: 'Test instance', manifestUrl: 'https://example.com/packpanel.json', isDefault: true }] })
} }));
vi.mock('@packpanel/engine', async () => {
  const { EventEmitter } = await import('node:events');
  const { parseJvmArguments } = await import('../../engine/src/utils/arguments');
  return {
    parseJvmArguments,
    MinecraftEngine: class extends EventEmitter { constructor() { super(); state.engine = this; } launchInstance = state.launch; stopInstance = vi.fn(); },
    createOfflineProfile: (name: string) => ({ name, id: '123', userType: 'offline', accessToken: '0' }),
    MicrosoftAuthenticator: vi.fn()
  };
});
const invoke = (name: string, value?: unknown) => state.handlers.get('launcher:' + name)!(null, value);
beforeEach(async () => {
  vi.resetModules(); state.handlers.clear(); state.launch.mockReset().mockResolvedValue(undefined); state.offline = true; state.saved = ''; state.openPath.mockClear();
  await import('../src/main/index');
});
describe('Desktop launch lifecycle', () => {
  it('requires a login and respects the configured auth provider', async () => {
    await expect(invoke('launchInstance', { instanceId: '22222222-2222-4222-8222-222222222222' })).rejects.toThrow('connecter');
    state.offline = false;
    await expect(invoke('loginOffline', 'Player')).rejects.toThrow('désactivée');
    await expect(invoke('startMicrosoftLogin')).rejects.toThrow('désactivée');
  });
  it('rejects unknown instances and invalid memory allocations', async () => {
    await invoke('loginOffline', 'Player');
    await expect(invoke('launchInstance', { instanceId: 'other' })).rejects.toThrow('configurée');
    await expect(invoke('launchInstance', { instanceId: '22222222-2222-4222-8222-222222222222', ramMb: -1 })).rejects.toThrow('mémoire');
    expect(state.launch).not.toHaveBeenCalled();
  });
  it('blocks a second game until the running process exits', async () => {
    await invoke('loginOffline', 'Player');
    const options = { instanceId: '22222222-2222-4222-8222-222222222222' };
    await invoke('launchInstance', options);
    await expect(invoke('launchInstance', options)).rejects.toThrow('déjà');
    state.engine.emit('exit');
    await invoke('launchInstance', options);
    expect(state.launch).toHaveBeenCalledTimes(2);
  });
  it('allows retry after preparation fails', async () => {
    await invoke('loginOffline', 'Player');
    state.launch.mockRejectedValueOnce(new Error('network unavailable'));
    const options = { instanceId: '22222222-2222-4222-8222-222222222222' };
    await expect(invoke('launchInstance', options)).rejects.toThrow('network unavailable');
    await invoke('launchInstance', options);
    expect(state.launch).toHaveBeenCalledTimes(2);
  });
  it('persists player settings and adds custom JVM arguments to the selected instance', async () => {
    await invoke('saveSettings', { ramMb: 2048, customJvmArgs: '-Drelease.test=true -Dlabel="two words"' });
    await invoke('loginOffline', 'Player');
    await invoke('launchInstance', {});
    expect(state.launch).toHaveBeenCalledWith(expect.objectContaining({ maxMemoryMb: 2048, customJvmArgs: ['-Drelease.test=true', '-Dlabel=two words'] }));
    await expect(invoke('saveSettings', { ramMb: 2048, customJvmArgs: '-Dbroken="quote' })).rejects.toThrow('guillemet');
  });
  it('opens only the game directory associated with the embedded instance', async () => {
    await invoke('openGameDirectory', 'C:/arbitrary-path');
    expect(state.openPath).toHaveBeenCalledWith(expect.stringMatching(/instances[/\\]test-instance$/));
  });
});
