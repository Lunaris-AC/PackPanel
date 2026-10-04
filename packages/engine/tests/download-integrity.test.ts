import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadFile } from '../src/utils/http';

describe('Atomic downloads', () => {
  let dir: string; let server: http.Server; let url: string;
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packpanel-download-test-'));
    server = http.createServer((_req, res) => res.end('new'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}/file`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }); });
  it('keeps the existing file when the replacement has the wrong size', async () => {
    const file = path.join(dir, 'file'); fs.writeFileSync(file, 'old');
    await expect(downloadFile(url, file, { expectedSize: 4, maxRetries: 1 })).rejects.toThrow('Taille invalide');
    expect(fs.readFileSync(file, 'utf8')).toBe('old'); expect(fs.readdirSync(dir)).toEqual(['file']);
  });
  it('rejects a corrupted checksum and only installs the verified replacement', async () => {
    const file = path.join(dir, 'file');
    await expect(downloadFile(url, file, { expectedSha1: '0'.repeat(40), maxRetries: 1 })).rejects.toThrow('Checksum');
    expect(fs.existsSync(file)).toBe(false);
    await downloadFile(url, file, { expectedSize: 3 });
    expect(fs.readFileSync(file, 'utf8')).toBe('new');
  });
});
