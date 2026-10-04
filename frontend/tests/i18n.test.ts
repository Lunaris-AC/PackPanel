import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../src/i18n/messages';
import { translations, Translations } from '../src/i18n';
import { selectedLanguage, translateMessage, translateApiMessage } from '../src/i18n/text';
import { formatBytes, locale } from '../src/i18n/format';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

function keys(dictionary: Translations, prefix = ''): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keys(value, `${prefix}${key}.`)).sort();
}

afterEach(() => vi.unstubAllGlobals());

describe('Complete French and English panel translations', () => {
  it('keeps both existing dictionaries complete', () => {
    expect(keys(translations.en)).toEqual(keys(translations.fr));
  });
  it('keeps translated messages and substitution fields complete', () => {
    for (const [source, pair] of Object.entries(messages)) {
      expect(pair[0].trim(), source).not.toBe('');
      expect(pair[1].trim(), source).not.toBe('');
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) || []).sort();
      expect(placeholders(pair[1]), source).toEqual(placeholders(pair[0]));
    }
  });
  it('keeps French interface literals inside translation calls or bilingual branches', () => {
    const failures: string[] = [];
    function inspect(directory: string) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) { if (entry.name !== 'i18n') inspect(filename); continue; }
        if (!filename.endsWith('.tsx')) continue;
        const file = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        function visit(node: ts.Node) {
          if (ts.isCallExpression(node) && ['t', 'tr', 'text'].includes(node.expression.getText(file))) return;
          if (ts.isConditionalExpression(node) && node.condition.getText(file).includes('language')) return;
          if ((ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
              /[àâçèéêëîïôùûüœ]|\b(Aucune?|Optionnel|Enregistrement|Supprimer|Rechercher|fichiers|Annulation|Chargement)\b/.test(node.text)) {
            failures.push(`${path.basename(filename)}: ${node.text.trim()}`);
          }
          ts.forEachChild(node, visit);
        }
        visit(file);
      }
    }
    inspect(fileURLToPath(new URL('../src', import.meta.url)));
    expect(failures).toEqual([]);
  });
  it('translates dynamic UI messages without interpreting player input', () => {
    expect(translateMessage('Instance "{0}" créée avec succès !', 'en', { 0: 'Pack {1} $&' }))
      .toBe('Instance "Pack {1} $&" created successfully!');
  });
  it('translates actual catalog and permission errors while preserving values', () => {
    expect(translateApiMessage('Le loader "quilt" n\'est pas disponible pour Minecraft 26.1.', 'en'))
      .toBe('Loader "quilt" is unavailable for Minecraft 26.1.');
    expect(translateApiMessage('Une instance avec le slug "survie" existe déjà.', 'en'))
      .toBe('An instance with slug "survie" already exists.');
    expect(translateApiMessage('Droits insuffisants sur cette instance', 'en'))
      .toBe('Insufficient permissions on this instance');
    expect(translateApiMessage('Unexpected upstream response: EPIPE', 'en'))
      .toBe('Unexpected upstream response: EPIPE');
    expect(translateApiMessage('Impossible de récupérer le catalogue officiel Minecraft: Erreur réseau', 'en'))
      .toBe('Unable to retrieve the official Minecraft catalog: Network error');
    expect(translateApiMessage('Une instance avec le slug "Supprimer" existe déjà.', 'en'))
      .toBe('An instance with slug "Supprimer" already exists.');
  });
  it('uses saved language ahead of browser language and localizes units and dates', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' });
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    expect(selectedLanguage()).toBe('en');
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(locale()).toBe('en-GB');
    expect(formatBytes(1024 ** 2, 1, 'fr')).toBe('1 Mo');
  });
});
