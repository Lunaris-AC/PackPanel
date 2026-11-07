import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { probeMinecraftStatus } from '../src/api/minecraft-status';

const { resolveSrv, resolve4, resolve6, createConnection } = vi.hoisted(() => ({
  resolveSrv: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  createConnection: vi.fn()
}));

vi.mock('node:dns/promises', () => ({
  Resolver: class { resolveSrv = resolveSrv; resolve4 = resolve4; resolve6 = resolve6; }
}));
vi.mock('node:net', async importOriginal => ({
  ...await importOriginal<typeof import('node:net')>(),
  createConnection
}));

describe('Minecraft status probe', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolveSrv.mockResolvedValue([]);
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue([]);
  });

  it.each(['127.0.0.1:25565', '127.1', '169.254.169.254', '[::ffff:7f00:1]:25565', '[fd00::1]'])(
    'refuses special-use IP address %s before opening a socket', async address => {
      await expect(probeMinecraftStatus(address)).resolves.toEqual({ status: 'private_address' });
      expect(createConnection).not.toHaveBeenCalled();
    }
  );

  it('refuses a private address reached through DNS SRV', async () => {
    resolveSrv.mockResolvedValue([{ name: 'internal.example', port: 25570, priority: 0, weight: 0 }]);
    resolve4.mockResolvedValue(['10.1.2.3']);
    await expect(probeMinecraftStatus('play.example')).resolves.toEqual({ status: 'private_address' });
    expect(resolve4).toHaveBeenCalledWith('internal.example');
    expect(createConnection).not.toHaveBeenCalled();
  });

  it('pins the public SRV destination and reads a fragmented status response', async () => {
    resolveSrv.mockResolvedValue([{ name: 'node.example', port: 25570, priority: 0, weight: 0 }]);
    resolve4.mockResolvedValue(['10.1.2.3', '8.8.8.8']);
    const body = Buffer.from(JSON.stringify({ players: { online: 4, max: 25 } }));
    const frame = Buffer.concat([Buffer.from([body.length + 2, 0, body.length]), body]);
    const socket = Object.assign(new EventEmitter(), { write: vi.fn(), destroy: vi.fn() });
    createConnection.mockImplementation(() => {
      queueMicrotask(() => {
        socket.emit('connect');
        socket.emit('data', frame.subarray(0, 1));
        socket.emit('data', frame.subarray(1));
      });
      return socket;
    });

    await expect(probeMinecraftStatus('play.example')).resolves.toMatchObject({
      status: 'online', latencyMs: expect.any(Number), players: { online: 4, max: 25 }
    });
    const [options] = createConnection.mock.calls[0];
    expect(options).toMatchObject({ host: 'play.example', port: 25570 });
    const lookup = vi.fn();
    options.lookup('play.example', { all: true }, lookup);
    expect(lookup).toHaveBeenCalledWith(null, [{ address: '8.8.8.8', family: 4 }]);
    expect(socket.write).toHaveBeenCalledWith(Buffer.from('1600ffffffff0f0c706c61792e6578616d706c6563e2010100', 'hex'));
    expect(socket.destroy).toHaveBeenCalled();
  });
});
