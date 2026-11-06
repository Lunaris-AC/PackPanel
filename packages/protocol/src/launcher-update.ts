import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().regex(/^[a-f0-9]{40}$/);
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const LauncherRuntimeSchema = z.object({
  revision,
  sequence,
  feed: z.string().url().refine(value => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }),
  publicKey: base64url.max(128)
});
export type LauncherRuntime = z.infer<typeof LauncherRuntimeSchema>;

const ReleaseSchema = z.object({
  kind: z.literal('packpanel-windows-x64-v1'),
  revision,
  sequence,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(512 * 1024 * 1024),
  expiresAt: z.number().int().positive()
});
export type LauncherRuntimeRelease = z.infer<typeof ReleaseSchema>;
const EnvelopeSchema = z.object({ payload: base64url.max(2048), signature: base64url.length(86) });

export function launcherUpdatePublicKey(privateKey: string): string {
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Invalid launcher update signing key');
  return createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64url');
}

export function signLauncherRuntime(release: LauncherRuntimeRelease, privateKey: string) {
  const data = Buffer.from(JSON.stringify(ReleaseSchema.parse(release)), 'utf8');
  return { payload: data.toString('base64url'), signature: sign(null, data, privateKey).toString('base64url') };
}

export function verifyLauncherRuntime(envelope: unknown, publicKey: string, now = Date.now()): LauncherRuntimeRelease {
  const { payload, signature } = EnvelopeSchema.parse(envelope);
  const key = createPublicKey({ key: Buffer.from(publicKey, 'base64url'), format: 'der', type: 'spki' });
  const data = Buffer.from(payload, 'base64url');
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, data, key, Buffer.from(signature, 'base64url'))) {
    throw new Error('Invalid launcher update signature');
  }
  const release = ReleaseSchema.parse(JSON.parse(data.toString('utf8')));
  if (release.expiresAt <= now) throw new Error('Expired launcher update metadata');
  return release;
}
