import { selectedLanguage, Language } from './text';

export function locale(language: Language = selectedLanguage()): string {
  return language === 'fr' ? 'fr-FR' : 'en-GB';
}

export function formatBytes(bytes?: number | null, decimals = 1, language: Language = selectedLanguage()): string {
  const units = language === 'fr' ? ['B', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];
  if (!bytes || bytes <= 0) return `0 ${units[0]}`;
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** index).toFixed(decimals))} ${units[index]}`;
}
