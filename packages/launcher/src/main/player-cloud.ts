import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const optionNames = ['options.txt', 'optionsof.txt', 'optionsshaders.txt'] as const;
const maxBytes = 128 * 1024;
const keySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const revisionSchema = z.object({ revision: z.number().int().nonnegative() });
const remoteSchema = revisionSchema.extend({ payload: z.string().max(180_000).optional() });
const localSchema = z.object({
  key: keySchema.optional(),
  revision: z.number().int().nonnegative().optional(),
  fingerprint: z.string().optional(),
  shareLogs: z.boolean().default(true)
});
type LocalState = z.infer<typeof localSchema>;

const optionsSchema = z.object({
  'options.txt': z.string().optional(),
  'optionsof.txt': z.string().optional(),
  'optionsshaders.txt': z.string().optional()
}).strict();
type GameOptions = z.infer<typeof optionsSchema>;

function optionFile(dir: string, name: string) {
  const file = path.join(dir, name);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.size > maxBytes)) throw new Error('Invalid Minecraft options file');
  return { file, stat };
}

function checkGameDirectory(dir: string) {
  if (!fs.lstatSync(dir, { throwIfNoEntry: false })?.isDirectory()) throw new Error('Invalid Minecraft directory');
}

function readOptions(dir: string): GameOptions {
  checkGameDirectory(dir);
  const result: GameOptions = {};
  for (const name of optionNames) {
    const { file, stat } = optionFile(dir, name);
    if (stat) result[name] = fs.readFileSync(file, 'utf8');
  }
  return result;
}

function restoreOptions(dir: string, options: GameOptions) {
  checkGameDirectory(dir);
  for (const name of optionNames) optionFile(dir, name);
  for (const name of optionNames) {
    const value = options[name];
    if (value === undefined) continue;
    const temporary = path.join(dir, `.packpanel-options-${randomBytes(12).toString('hex')}`);
    try {
      fs.writeFileSync(temporary, value, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, path.join(dir, name));
    } finally { fs.rmSync(temporary, { force: true }); }
  }
}

function fingerprint(options: GameOptions) {
  return createHash('sha256').update(JSON.stringify(options)).digest('hex');
}

export class PlayerCloud {
  private readonly url: URL;
  private readonly aad: Buffer;

  constructor(
    instance: { id: string; manifestUrl: string },
    private readonly read: () => string,
    private readonly write: (content: string) => void
  ) {
    this.url = new URL(`../player-services/${instance.id}`, instance.manifestUrl);
    this.aad = Buffer.from(`packpanel-game-options-v1:${instance.id}`);
  }

  get supported() { return this.url.protocol === 'https:' && !this.url.username && !this.url.password; }

  private state(): LocalState {
    try { return localSchema.parse(JSON.parse(this.read())); }
    catch { return { shareLogs: true }; }
  }

  private save(state: LocalState) { this.write(JSON.stringify(state)); }

  async settings() {
    const state = this.state();
    const response = await this.request('').catch(() => undefined);
    const data = response?.ok ? await response.json().catch(() => null) : null;
    return { available: this.supported, backupEnabled: data?.backupEnabled === true, backupActive: !!state.key, shareLogs: state.shareLogs };
  }

  async configureBackup(value?: string) {
    if (!(await this.settings()).backupEnabled) throw new Error('Backup unavailable');
    const state = this.state();
    if (value === undefined) {
      if (!state.key) this.save({ ...state, key: randomBytes(32).toString('base64url') });
      return;
    }
    const key = keySchema.parse(value.trim());
    const remote = await this.remote(key);
    if (remote.disabled || !remote.revision) throw new Error('Backup not found');
    this.decrypt(key, remote.payload);
    this.save({ shareLogs: this.state().shareLogs, key });
  }

  copyKey() { return this.state().key; }
  setShareLogs(shareLogs: boolean) { this.save({ ...this.state(), shareLogs }); }
  get sharesLogs() { return this.state().shareLogs; }

  private keys(key: string) {
    const seed = Buffer.from(key, 'base64url');
    return {
      encryption: Buffer.from(hkdfSync('sha256', seed, this.aad, 'encryption', 32)),
      authorization: Buffer.from(hkdfSync('sha256', seed, this.aad, 'authorization', 32)).toString('base64url')
    };
  }

  private encrypt(key: string, options: GameOptions) {
    const data = Buffer.from(JSON.stringify(options));
    if (data.length > maxBytes) throw new Error('Minecraft options exceed the backup size limit');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys(key).encryption, iv);
    cipher.setAAD(this.aad);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  private decrypt(key: string, payload?: string) {
    const data = Buffer.from(payload ?? '', 'base64url');
    if (data.length < 30 || data.length > maxBytes + 28) throw new Error('Invalid backup');
    const decipher = createDecipheriv('aes-256-gcm', this.keys(key).encryption, data.subarray(0, 12));
    decipher.setAAD(this.aad);
    decipher.setAuthTag(data.subarray(12, 28));
    return optionsSchema.parse(JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString()));
  }

  private request(resource: string, method = 'GET', body?: unknown, key?: string) {
    if (!this.supported) throw new Error('HTTPS required for player services');
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (key) headers.Authorization = `Bearer ${this.keys(key).authorization}`;
    return fetch(this.url.href + resource, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000)
    });
  }

  private async remote(key: string) {
    const response = await this.request('/options', 'GET', undefined, key);
    if (response.status === 404) return { revision: 0, disabled: true } as const;
    if (!response.ok) throw new Error('Could not read player options');
    return { ...remoteSchema.parse(await response.json()), disabled: false } as const;
  }

  // Reconcile before Minecraft reads its options, then compare-and-swap at exit.
  async prepareOptions(dir: string) {
    const { key, revision, fingerprint: previous } = this.state();
    if (!key) return;
    const remote = await this.remote(key);
    if (remote.disabled) return;

    let local = readOptions(dir);
    let base = previous;
    if (remote.revision > 0 && (remote.revision !== revision || !Object.keys(local).length)) {
      if (revision !== undefined && Object.keys(local).length && fingerprint(local) !== previous) {
        throw new Error('Minecraft options changed on two devices');
      }
      restoreOptions(dir, this.decrypt(key, remote.payload));
      local = readOptions(dir);
      base = fingerprint(local);
      this.save({ ...this.state(), revision: remote.revision, fingerprint: base });
    }

    return async () => {
      if (this.state().key !== key) return;
      const options = readOptions(dir);
      const current = fingerprint(options);
      if (!Object.keys(options).length || current === base) return;
      const response = await this.request('/options', 'PUT', {
        revision: remote.revision, payload: this.encrypt(key, options)
      }, key);
      if (!response.ok) throw new Error('Could not save player options');
      const result = revisionSchema.parse(await response.json());
      if (this.state().key === key) this.save({ ...this.state(), revision: result.revision, fingerprint: current });
    };
  }

  async sendLog(report: { id: string; player: string; exitCode: number; log: string }) {
    if (!this.supported || !this.sharesLogs || !report.log) return;
    const response = await this.request('/game-logs', 'POST', report);
    if (!response.ok) throw new Error('Could not send Minecraft diagnostics');
  }
}
