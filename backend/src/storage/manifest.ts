import { encodeUrlPath } from './paths';

export interface MineLaunchedFileEntry {
  path: string;
  checksumSHA1: string;
  url: string;
}

export interface MineLaunchedDirEntry {
  path: string;
  checksumSHA1: false;
  url: string;
}

export interface MineLaunchedDirective {
  dirCheckUselessFiles: string;
}

export type MineLaunchedEntry = MineLaunchedFileEntry | MineLaunchedDirEntry | MineLaunchedDirective;

export interface FileRecordInput {
  relativePath: string;
  sha1?: string | null;
  isDir: boolean;
}

/**
 * Builds the canonical MineLaunched JSON manifest.
 */
export function buildMineLaunchedManifest(
  files: FileRecordInput[],
  endpointSlug: string,
  releaseId: string,
  filesFqdn: string,
  cleanupRules: string[] = ['mods']
): MineLaunchedEntry[] {
  // baseUrl format: https://<FILES_FQDN>/<slug>/releases/<release-id>/
  const baseUrl = `https://${filesFqdn}/${endpointSlug}/releases/${releaseId}`;

  // Collect all explicitly mentioned directories and infer implicit parent directories
  const directories = new Set<string>();
  const fileItems: FileRecordInput[] = [];

  for (const item of files) {
    if (item.isDir) {
      let p = item.relativePath;
      if (!p.endsWith('/')) p += '/';
      directories.add(p);
      
      // Add all parents
      const parts = p.slice(0, -1).split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current += parts[i] + '/';
        directories.add(current);
      }
    } else {
      fileItems.push(item);
      // Infer parent directories from file paths
      const parts = item.relativePath.split('/');
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current += parts[i] + '/';
        directories.add(current);
      }
    }
  }

  // Deterministic sorting of directories: parents before children, then alphabetically
  const sortedDirs = Array.from(directories).sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.localeCompare(b);
  });

  const manifest: MineLaunchedEntry[] = [];

  // 1. Add directories
  for (const dirPath of sortedDirs) {
    manifest.push({
      path: dirPath,
      checksumSHA1: false,
      url: `${baseUrl}/${encodeUrlPath(dirPath)}`
    });
  }

  // 2. Add files (sorted alphabetically)
  const sortedFiles = [...fileItems].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const file of sortedFiles) {
    if (!file.sha1 || file.sha1.length !== 40) {
      throw new Error(`SHA-1 invalide pour le fichier ${file.relativePath}`);
    }
    manifest.push({
      path: file.relativePath,
      checksumSHA1: file.sha1.toLowerCase(),
      url: `${baseUrl}/${encodeUrlPath(file.relativePath)}`
    });
  }

  // 3. Add cleanup directives at the end
  if (Array.isArray(cleanupRules)) {
    for (const rule of cleanupRules) {
      if (rule && typeof rule === 'string' && rule.trim() !== '') {
        manifest.push({
          dirCheckUselessFiles: rule.trim()
        });
      }
    }
  }

  return manifest;
}

/**
 * Validates whether a JSON data structure strictly conforms to the MineLaunched contract.
 */
export function validateMineLaunchedContract(manifestData: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(manifestData)) {
    return { valid: false, errors: ['Le manifeste doit être un tableau JSON racine'] };
  }

  let seenDirective = false;
  const seenPaths = new Set<string>();

  for (let i = 0; i < manifestData.length; i++) {
    const item = manifestData[i];

    if (item && typeof item === 'object' && 'dirCheckUselessFiles' in item) {
      seenDirective = true;
      if (typeof item.dirCheckUselessFiles !== 'string' || item.dirCheckUselessFiles.trim() === '') {
        errors.push(`Entrée ${i} : directive de nettoyage avec valeur non textuelle ou vide`);
      }
      continue;
    }

    if (seenDirective) {
      errors.push(`Entrée ${i} : fichier ou dossier trouvé après une directive de nettoyage`);
    }

    if (!item || typeof item !== 'object') {
      errors.push(`Entrée ${i} : élément invalide`);
      continue;
    }

    if (typeof item.path !== 'string') {
      errors.push(`Entrée ${i} : path manquant ou non textuel`);
      continue;
    }

    if (seenPaths.has(item.path)) {
      errors.push(`Entrée ${i} : chemin dupliqué "${item.path}"`);
    }
    seenPaths.add(item.path);

    if (typeof item.url !== 'string' || !item.url.startsWith('https://')) {
      errors.push(`Entrée ${i} : URL HTTPS absolue manquante ou invalide pour "${item.path}"`);
    }

    if (item.checksumSHA1 === false) {
      // Must be a directory
      if (!item.path.endsWith('/')) {
        errors.push(`Entrée ${i} : le dossier "${item.path}" doit se terminer par un "/"`);
      }
      if (!item.url.endsWith('/')) {
        errors.push(`Entrée ${i} : l'URL du dossier "${item.url}" doit se terminer par un "/"`);
      }
    } else if (typeof item.checksumSHA1 === 'string') {
      // Must be a file
      if (item.path.endsWith('/')) {
        errors.push(`Entrée ${i} : le fichier "${item.path}" ne doit pas se terminer par un "/"`);
      }
      if (!/^[0-9a-f]{40}$/.test(item.checksumSHA1)) {
        errors.push(`Entrée ${i} : SHA-1 invalide "${item.checksumSHA1}" pour "${item.path}" (doit être 40 hex minuscules)`);
      }
    } else {
      errors.push(`Entrée ${i} : checksumSHA1 doit être false ou une chaîne SHA-1 hexadécimale`);
    }
  }

  return { valid: errors.length === 0, errors };
}
