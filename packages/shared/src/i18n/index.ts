import type { Locale } from '../domain.js';
import { en } from './en.js';
import { sv, type MessageKey } from './sv.js';

export { sv, en };
export type { MessageKey };

export const catalogues: Record<Locale, Record<MessageKey, string>> = { sv, en };

/**
 * Slår upp en text och ersätter platshållare på formen {name}.
 * Saknad nyckel faller tillbaka på svenska och sist på nyckeln själv, så att
 * gränssnittet aldrig visar en tom sträng.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = catalogues[locale]?.[key] ?? sv[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Kontrollerar att alla språk har samma nyckeluppsättning (används i test). */
export function missingKeys(locale: Locale): MessageKey[] {
  const target = catalogues[locale];
  return (Object.keys(sv) as MessageKey[]).filter((key) => !target[key]);
}
