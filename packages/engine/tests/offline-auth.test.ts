import { describe, it, expect } from 'vitest';
import { generateOfflineUuid, createOfflineProfile } from '../src/auth/offline.js';

describe('Engine: Offline Authentication', () => {
  it('generates deterministic UUID v3 matching official Minecraft algorithm', () => {
    // Notch offline test vector:
    // String "OfflinePlayer:Notch" in Java UUID.nameUUIDFromBytes -> b50ad385-829d-3141-a216-7e7d7539ba7f
    const uuid = generateOfflineUuid('Notch');
    expect(uuid).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
  });

  it('creates valid AuthProfile for offline player', () => {
    const profile = createOfflineProfile('Steve');
    expect(profile.name).toBe('Steve');
    expect(profile.userType).toBe('offline');
    expect(profile.accessToken).toBe('offline_token');
    expect(profile.id).toHaveLength(32); // UUID without hyphens
  });

  it('rejects invalid player names', () => {
    expect(() => createOfflineProfile('')).toThrow();
    expect(() => createOfflineProfile('a')).toThrow(); // Too short
    expect(() => createOfflineProfile('SuperLongPlayerNameExceeding16Chars')).toThrow(); // Too long
    expect(() => createOfflineProfile('Invalid Name!')).toThrow(); // Invalid characters
  });
});
