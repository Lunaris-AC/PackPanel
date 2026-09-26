import os from 'os';

export type MojangOsName = 'windows' | 'osx' | 'linux';

export function getCurrentMojangOs(): MojangOsName {
  const p = os.platform();
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'osx';
  return 'linux';
}

export function getCurrentMojangArch(): 'x64' | 'arm64' | 'x86' {
  const a = os.arch();
  if (a === 'arm64') return 'arm64';
  if (a === 'ia32') return 'x86';
  return 'x64';
}

export interface MojangRule {
  action: 'allow' | 'disallow';
  os?: {
    name?: MojangOsName | string;
    version?: string;
    arch?: string;
  };
  features?: Record<string, boolean>;
}

export function evaluateRules(rules?: MojangRule[], activeFeatures?: Record<string, boolean>): boolean {
  if (!rules || rules.length === 0) {
    return true;
  }

  const currentOs = getCurrentMojangOs();
  const currentArch = getCurrentMojangArch();
  let allowed = false;

  for (const rule of rules) {
    let matches = true;

    if (rule.os) {
      if (rule.os.name && rule.os.name !== currentOs) {
        matches = false;
      }
      if (rule.os.arch && rule.os.arch !== currentArch) {
        matches = false;
      }
    }

    if (rule.features && activeFeatures) {
      for (const [feat, expected] of Object.entries(rule.features)) {
        if (Boolean(activeFeatures[feat]) !== expected) {
          matches = false;
          break;
        }
      }
    }

    if (matches) {
      allowed = rule.action === 'allow';
    }
  }

  return allowed;
}

export function mavenToPath(coord: string, extension: string = 'jar'): string {
  // e.g. "org.ow2.asm:asm:9.5" or "org.lwjgl:lwjgl-jemalloc:3.3.2:natives-windows"
  const parts = coord.split(':');
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const version = parts[2];
  const classifier = parts[3] ? `-${parts[3]}` : '';

  return `${group}/${artifact}/${version}/${artifact}-${version}${classifier}.${extension}`;
}
