import { Resolver } from 'node:dns/promises';
import { BlockList, createConnection, isIP } from 'node:net';
import { domainToASCII } from 'node:url';

const DEFAULT_PORT = 25565;
const MAX_RESPONSE_BYTES = 256 * 1024;
const SOCKET_TIMEOUT_MS = 3000;

const specialIpv4 = new BlockList();
for (const [network, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 3]
] as const) specialIpv4.addSubnet(network, bits);

const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const specialIpv6 = new BlockList();
for (const [network, bits] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]
] as const) specialIpv6.addSubnet(network, bits, 'ipv6');

function isPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !specialIpv4.check(address);
  return family === 6 && globalIpv6.check(address, 'ipv6') && !specialIpv6.check(address, 'ipv6');
}

function parseAddress(address: string) {
  const value = address.trim();
  if (/[\\/%@?#]/.test(value)) return null;
  if (isIP(value)) return { host: value, port: DEFAULT_PORT, useSrv: false };

  const match = /^(?:\[([^\]]+)\]|([^:\s/]+))(?::(\d{1,5}))?$/.exec(value);
  if (!match) return null;
  const [, bracketed, hostname, explicitPort] = match;
  const host = bracketed || domainToASCII(hostname).replace(/\.$/, '');
  const port = explicitPort === undefined ? DEFAULT_PORT : Number(explicitPort);
  if (!host || port < 1 || port > 65535) return null;
  if (bracketed) return isIP(host) === 6 ? { host, port, useSrv: false } : null;
  if (isIP(host)) return { host, port, useSrv: false };
  if (host.length > 253 || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) {
    return null;
  }
  return { host, port, useSrv: port === DEFAULT_PORT };
}

function varInt(value: number): Buffer {
  const bytes = [];
  value >>>= 0;
  do {
    const byte = value & 0x7f;
    value >>>= 7;
    bytes.push(value ? byte | 0x80 : byte);
  } while (value);
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset: number) {
  let value = 0;
  for (let i = 0; i < 5 && offset + i < buffer.length; i++) {
    const byte = buffer[offset + i];
    value |= (byte & 0x7f) << (i * 7);
    if (!(byte & 0x80)) {
      if (i === 4 && byte > 0x0f) throw new Error('Invalid VarInt');
      return { value, end: offset + i + 1 };
    }
    if (i === 4) throw new Error('Invalid VarInt');
  }
  return null;
}

function statusRequest(host: string, port: number) {
  const hostname = Buffer.from(host, 'utf8');
  const portBytes = Buffer.alloc(2);
  portBytes.writeUInt16BE(port);
  const handshake = Buffer.concat([Buffer.from([0]), varInt(-1), varInt(hostname.length), hostname, portBytes, Buffer.from([1])]);
  return Buffer.concat([varInt(handshake.length), handshake, Buffer.from([1, 0])]);
}

type Players = { online: number; max: number };
export type MinecraftStatus =
  | { status: 'online'; latencyMs: number; players: Players | null }
  | { status: 'invalid_address' | 'private_address' | 'unresolved' | 'no_response' };

function probeSocket(host: string, port: number, addresses: Array<{ address: string; family: number }>): Promise<MinecraftStatus> {
  return new Promise(resolve => {
    const socket = createConnection({
      host, port, autoSelectFamily: true,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      }
    });
    const startedAt = performance.now();
    const deadline = setTimeout(() => finish({ status: 'no_response' }), SOCKET_TIMEOUT_MS);
    let response = Buffer.alloc(0);

    function finish(result: MinecraftStatus) {
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    }

    socket.once('connect', () => socket.write(statusRequest(host, port)));
    socket.once('error', () => finish({ status: 'no_response' }));
    socket.once('close', () => finish({ status: 'no_response' }));
    socket.on('data', chunk => {
      try {
        if (response.length + chunk.length > MAX_RESPONSE_BYTES) throw new Error('Status response too large');
        response = Buffer.concat([response, chunk]);
        const frame = readVarInt(response, 0);
        if (!frame) return;
        const end = frame.end + frame.value;
        if (frame.value <= 0 || end > MAX_RESPONSE_BYTES) throw new Error('Invalid status packet length');
        if (response.length < end) return;

        const payload = response.subarray(frame.end, end);
        const id = readVarInt(payload, 0);
        const json = id?.value === 0 && readVarInt(payload, id.end);
        if (!json || json.value <= 0 || json.end + json.value !== payload.length) throw new Error('Invalid status packet');
        const status = JSON.parse(payload.toString('utf8', json.end));
        if (!status || typeof status !== 'object' || Array.isArray(status)) throw new Error('Invalid status response');
        const { online, max } = status.players ?? {};
        const players = Number.isSafeInteger(online) && online >= 0 && Number.isSafeInteger(max) && max >= 0
          ? { online, max }
          : null;
        finish({ status: 'online', latencyMs: Math.round(performance.now() - startedAt), players });
      } catch {
        finish({ status: 'no_response' });
      }
    });
  });
}

export async function probeMinecraftStatus(address: string): Promise<MinecraftStatus> {
  const target = parseAddress(address);
  if (!target) return { status: 'invalid_address' };
  const { host } = target;
  let { port } = target;
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  let lookupHost = host;
  if (target.useSrv) {
    const records = await resolver.resolveSrv(`_minecraft._tcp.${host}`).catch(() => []);
    const record = records.sort((a, b) => a.priority - b.priority)[0];
    if (record) {
      if (!record.name || !record.port || record.name === '.') return { status: 'unresolved' };
      lookupHost = record.name;
      port = record.port;
    }
  }

  const candidates = isIP(lookupHost)
    ? [lookupHost]
    : (await Promise.all([
      resolver.resolve4(lookupHost).catch(() => []),
      resolver.resolve6(lookupHost).catch(() => [])
    ])).flat();
  if (!candidates.length) return { status: 'unresolved' };
  const addresses = candidates.filter(isPublicIp).map(address => ({ address, family: isIP(address) }));
  if (!addresses.length) return { status: 'private_address' };

  // Pin the validated DNS answers so the connection cannot resolve the host a second time.
  return probeSocket(host, port, addresses);
}
