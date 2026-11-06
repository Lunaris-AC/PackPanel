import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { launcherUpdatePublicKey, signLauncherRuntime, verifyLauncherRuntime } from '../src/launcher-update.js';

const privateKey = () => generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const key = privateKey();
const publicKey = launcherUpdatePublicKey(key);
const release = {
  kind: 'packpanel-windows-x64-v1' as const, revision: 'a'.repeat(40), sequence: 42,
  sha256: 'b'.repeat(64), bytes: 1234, expiresAt: 1000
};

describe('Windows launcher releases', () => {
  it('verifies metadata against the installed signing key', () => {
    expect(verifyLauncherRuntime(signLauncherRuntime(release, key), publicKey, 1)).toEqual(release);
    expect(() => verifyLauncherRuntime(signLauncherRuntime(release, privateKey()), publicKey, 1)).toThrow('signature');
  });

  it('rejects edited content and expired metadata', () => {
    const envelope = signLauncherRuntime(release, key);
    const payload = Buffer.from(JSON.stringify({ ...release, sha256: 'c'.repeat(64) })).toString('base64url');
    expect(() => verifyLauncherRuntime({ ...envelope, payload }, publicKey, 1)).toThrow('signature');
    expect(() => verifyLauncherRuntime(envelope, publicKey, release.expiresAt)).toThrow('Expired');
  });
});
