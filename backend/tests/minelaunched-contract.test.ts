import { describe, it, expect } from 'vitest';
import {
  buildMineLaunchedManifest,
  validateMineLaunchedContract,
  FileRecordInput
} from '../src/storage/manifest';

describe('MineLaunched Contract Verification', () => {
  it('generates canonical manifest matching exact MineLaunched specification', () => {
    const input: FileRecordInput[] = [
      { relativePath: 'config/fancymenu/custom_screen.txt', sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709', isDir: false },
      { relativePath: 'mods/jei.jar', sha1: '1234567890abcdef1234567890abcdef12345678', isDir: false },
      { relativePath: 'config/', sha1: '', isDir: true },
      { relativePath: 'mods/', sha1: '', isDir: true }
    ];

    const manifest = buildMineLaunchedManifest(
      input,
      'testpack',
      'r0001',
      'cdn.example.com',
      ['mods', 'config']
    );

    // 1. Contract validation function must return valid
    const validation = validateMineLaunchedContract(manifest);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);

    // 2. Parents must precede children: config/ must appear before config/fancymenu/custom_screen.txt
    const paths = manifest.filter((entry: any) => entry.path).map((entry: any) => entry.path);
    expect(paths.indexOf('config/')).toBeLessThan(paths.indexOf('config/fancymenu/custom_screen.txt'));
    expect(paths.indexOf('mods/')).toBeLessThan(paths.indexOf('mods/jei.jar'));

    // 3. Directory entry must have checksumSHA1 === false
    const configDirEntry = manifest.find((entry: any) => entry.path === 'config/');
    expect(configDirEntry).toBeDefined();
    expect(configDirEntry.checksumSHA1).toBe(false);
    expect(configDirEntry.url).toBe('https://cdn.example.com/testpack/releases/r0001/config/');

    // 4. File entry must have 40-char lowercase hex checksumSHA1
    const fileEntry = manifest.find((entry: any) => entry.path === 'mods/jei.jar');
    expect(fileEntry).toBeDefined();
    expect(fileEntry.checksumSHA1).toBe('1234567890abcdef1234567890abcdef12345678');
    expect(fileEntry.url).toBe('https://cdn.example.com/testpack/releases/r0001/mods/jei.jar');

    // 5. Cleanup directives must be at the very end as separate objects
    const lastTwo = manifest.slice(-2);
    expect(lastTwo).toEqual([
      { dirCheckUselessFiles: 'mods' },
      { dirCheckUselessFiles: 'config' }
    ]);
  });

  it('correctly handles special characters and URL encoding without double decoding', () => {
    const input: FileRecordInput[] = [
      { relativePath: 'config/é à test + # % name/file.txt', sha1: 'da39a3ee5e6b4b0d3255bfef95601890afd80709', isDir: false }
    ];

    const manifest = buildMineLaunchedManifest(
      input,
      'slug_spec',
      'r0002',
      'cdn.example.com',
      ['mods']
    );

    const file = manifest.find((e: any) => e.path && e.path.endsWith('file.txt'));
    expect(file).toBeDefined();
    expect(file.path).toBe('config/é à test + # % name/file.txt');
    // Ensure URL segments are encoded properly:
    expect(file.url).toContain('%C3%A9%20%C3%A0%20test%20%2B%20%23%20%25%20name/file.txt');
  });

  it('rejects manifest containing non-lowercase SHA-1 or invalid structure', () => {
    const invalidManifest = [
      {
        path: 'mods/test.jar',
        checksumSHA1: 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709', // uppercase
        url: 'https://cdn.example.com/p/releases/r1/mods/test.jar'
      }
    ];

    const validation = validateMineLaunchedContract(invalidManifest);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.includes('minuscules'))).toBe(true);
  });
});
