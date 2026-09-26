import { describe, it, expect } from 'vitest';
import { hashBuffer } from '../src/storage/hasher';

describe('Hasher single-pass dual hash', () => {
  it('correctly calculates SHA-1 and SHA-256 for an empty buffer', () => {
    const buf = Buffer.from('');
    const res = hashBuffer(buf);

    expect(res.sizeBytes).toBe(0);
    expect(res.sha1).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(res.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('correctly calculates SHA-1 and SHA-256 for known test payload', () => {
    const buf = Buffer.from('PackPanel Test Payload 12345!', 'utf8');
    const res = hashBuffer(buf);

    expect(res.sizeBytes).toBe(buf.length);
    expect(res.sha1).toHaveLength(40);
    expect(res.sha256).toHaveLength(64);
    expect(res.sha1).toBe(res.sha1.toLowerCase());
    expect(res.sha256).toBe(res.sha256.toLowerCase());
  });
});
