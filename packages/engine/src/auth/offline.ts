import crypto from 'crypto';
import { AuthProfile } from '@packpanel/protocol';

/**
 * Computes official Minecraft Offline Mode UUID (UUID v3 based on MD5 of "OfflinePlayer:" + username)
 */
export function generateOfflineUuid(username: string): string {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${username}`).digest();

  // Set version to 3 (UUID v3) -> bits 4-7 of time_hi_and_version to 0011
  hash[6] = (hash[6] & 0x0f) | 0x30;
  // Set variant to IETF (RFC 4122) -> bits 6-7 of clock_seq_hi_and_reserved to 10
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex');
  // Format as canonical UUID: 8-4-4-4-12
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-');
}

export function createOfflineProfile(username: string): AuthProfile {
  const cleanName = username.trim();
  if (!cleanName || cleanName.length < 3 || cleanName.length > 16 || !/^[a-zA-Z0-9_]+$/.test(cleanName)) {
    throw new Error('Le pseudonyme Minecraft offline doit comporter entre 3 et 16 caractères alphanumériques.');
  }

  const uuid = generateOfflineUuid(cleanName);

  return {
    id: uuid.replace(/-/g, ''),
    name: cleanName,
    userType: 'offline',
    accessToken: 'offline_token'
  };
}
