import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../src/auth/middleware';
import { hashRecoveryCode, verifyRecoveryCode } from '../src/auth/totp';
import { assertSanitizedRelativePath } from '../src/storage/paths';

describe('Security Hardening: Origin & CSRF', () => {
  it('allows requests with no origin (native clients, CLI, curl)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });

  it('allows localhost and loopback origins', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:8080')).toBe(true);
    expect(isAllowedOrigin('https://localhost:8443')).toBe(true);
  });

  it('allows private RFC1918 subnets', () => {
    expect(isAllowedOrigin('http://192.168.1.171:8080')).toBe(true);
    expect(isAllowedOrigin('http://10.0.0.5:8080')).toBe(true);
    expect(isAllowedOrigin('http://172.20.0.1:8080')).toBe(true);
  });

  it('rejects untrusted external origins', () => {
    expect(isAllowedOrigin('https://evil-attacker.com')).toBe(false);
    expect(isAllowedOrigin('https://phishing-site.org:8080')).toBe(false);
    expect(isAllowedOrigin('http://malicious.net')).toBe(false);
  });
});

describe('Security Hardening: TOTP Recovery Code Hashing', () => {
  const userId = '11111111-2222-3333-4444-555555555555';
  const code = 'ABCD-1234';

  it('hashes recovery code deterministically with user salt', () => {
    const hash1 = hashRecoveryCode(code, userId);
    const hash2 = hashRecoveryCode(code, userId);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(code);
    expect(hash1).toHaveLength(64); // SHA256 hex length
  });

  it('verifies correctly with matching user ID and code', () => {
    const hash = hashRecoveryCode(code, userId);
    const result = verifyRecoveryCode(code, [hash], userId);
    expect(result.valid).toBe(true);
    expect(result.matchingHash).toBe(hash);
  });

  it('rejects wrong code or wrong user ID', () => {
    const hash = hashRecoveryCode(code, userId);
    const resultWrongCode = verifyRecoveryCode('WRONG-CODE', [hash], userId);
    expect(resultWrongCode.valid).toBe(false);

    const resultWrongUser = verifyRecoveryCode(code, [hash], '99999999-8888-7777-6666-555555555555');
    expect(resultWrongUser.valid).toBe(false);
  });
});

describe('Security Hardening: Path Traversal Prevention', () => {
  it('allows safe relative paths', () => {
    expect(assertSanitizedRelativePath('mods/jei.jar')).toBe('mods/jei.jar');
    expect(assertSanitizedRelativePath('config/fml.toml')).toBe('config/fml.toml');
  });

  it('rejects path traversal sequences with ..', () => {
    expect(() => assertSanitizedRelativePath('../../../etc/passwd')).toThrow();
    expect(() => assertSanitizedRelativePath('mods/../../secret.txt')).toThrow();
    expect(() => assertSanitizedRelativePath('..\\..\\windows\\system32')).toThrow();
  });

  it('rejects null byte injection and control characters', () => {
    expect(() => assertSanitizedRelativePath('mods/evil.jar\0.txt')).toThrow();
    expect(() => assertSanitizedRelativePath('mods/evil\r\n.jar')).toThrow();
  });
});
