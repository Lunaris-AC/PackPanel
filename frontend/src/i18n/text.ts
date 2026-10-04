import { messages } from './messages';

export type Language = 'fr' | 'en';
export type Values = Record<string, string | number>;

export function selectedLanguage(): Language {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('packpanel_lang') : null;
  if (saved === 'fr' || saved === 'en') return saved;
  return typeof navigator !== 'undefined' && navigator.language.startsWith('fr') ? 'fr' : 'en';
}

export function translateMessage(source: string, language: Language, values: Values = {}): string {
  const message = messages[source]?.[language === 'fr' ? 0 : 1] ?? source;
  return message.replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : placeholder);
}

const dynamicMessages = Object.entries(messages).filter(([source]) => /\{\w+\}/.test(source))
  .sort(([left], [right]) => right.length - left.length)
  .map(([source]) => {
    const keys: string[] = [];
    const pattern = source.split(/(\{\w+\})/g).map(part => {
      if (/^\{\w+\}$/.test(part)) { keys.push(part.slice(1, -1)); return '(.*?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    return { source, keys, expression: new RegExp(`^${pattern}$`, 's') };
  });

// API messages contain values already substituted by the server. Match only
// known messages and preserve filenames, user text and unknown diagnostics.
export function translateApiMessage(message: string, language = selectedLanguage()): string {
  if (messages[message]) return translateMessage(message, language);
  for (const entry of dynamicMessages) {
    const match = entry.expression.exec(message);
    if (match) {
      const values = Object.fromEntries(entry.keys.map((key, index) => [key, match[index + 1]]));
      // Catalog errors wrap another diagnostic. Translate that diagnostic too,
      // while leaving names and paths in other messages exactly as supplied.
      if (/^(Erreur |Impossible de récupérer le catalogue|Contrat MineLaunched)/.test(entry.source) && entry.source.endsWith(': {0}')) {
        values['0'] = translateApiMessage(values['0'], language);
      }
      return translateMessage(entry.source, language, values);
    }
  }
  return message;
}

// For API errors and formatters called outside a React component.
export function translateText(source: string, values?: Values): string {
  return translateMessage(source, selectedLanguage(), values);
}
