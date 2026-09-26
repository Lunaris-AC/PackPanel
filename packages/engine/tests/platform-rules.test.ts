import { describe, it, expect } from 'vitest';
import { evaluateRules, mavenToPath } from '../src/utils/platform.js';

describe('Engine: Platform Rules & Maven Coordinates', () => {
  it('converts maven coordinate to jar path correctly', () => {
    expect(mavenToPath('net.fabricmc:fabric-loader:0.16.5')).toBe('net/fabricmc/fabric-loader/0.16.5/fabric-loader-0.16.5.jar');
    expect(mavenToPath('org.ow2.asm:asm-commons:9.6')).toBe('org/ow2/asm/asm-commons/9.6/asm-commons-9.6.jar');
    expect(mavenToPath('org.lwjgl:lwjgl:3.3.2:natives-windows')).toBe('org/lwjgl/lwjgl/3.3.2/lwjgl-3.3.2-natives-windows.jar');
  });

  it('evaluates Mojang library rules correctly', () => {
    // Universal allow
    expect(evaluateRules([{ action: 'allow' }])).toBe(true);

    // Rule with current OS match
    const currentOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
    const matchRule = [
      { action: 'disallow' },
      { action: 'allow', os: { name: currentOs } }
    ];
    expect(evaluateRules(matchRule as any)).toBe(true);

    // Rule with opposite OS match
    const oppositeOs = currentOs === 'windows' ? 'osx' : 'windows';
    const noMatchRule = [
      { action: 'disallow' },
      { action: 'allow', os: { name: oppositeOs } }
    ];
    expect(evaluateRules(noMatchRule as any)).toBe(false);
  });
});
