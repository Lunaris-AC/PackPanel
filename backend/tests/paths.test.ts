import { describe, it, expect } from 'vitest';
import { sanitizeRelativePath, assertSanitizedRelativePath, checkWindowsCaseCollision } from '../src/storage/paths';

describe('Path Sanitizer & Security', () => {
  it('normalizes valid paths with forward slashes and strips leading slashes', () => {
    const res = sanitizeRelativePath('/mods\\subdir/test.jar');
    expect(res.valid).toBe(true);
    expect(res.normalizedPath).toBe('mods/subdir/test.jar');
  });

  it('rejects path traversal attacks with ..', () => {
    const res1 = sanitizeRelativePath('../../../etc/passwd');
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('Traversée de répertoire');

    const res2 = sanitizeRelativePath('mods/../../secret.txt');
    expect(res2.valid).toBe(false);
  });

  it('rejects Windows reserved device names', () => {
    const res = sanitizeRelativePath('config/NUL/test.txt');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('réservé');

    const resAux = sanitizeRelativePath('aux.txt');
    expect(resAux.valid).toBe(false);
  });

  it('detects Windows case collisions in a collection of paths', () => {
    const collision = checkWindowsCaseCollision([
      'config/JEI/recipe.json',
      'config/jei/recipe.json'
    ]);

    expect(collision.collision).toBe(true);
    expect(collision.first).toBe('config/JEI/recipe.json');
    expect(collision.second).toBe('config/jei/recipe.json');
  });
});
