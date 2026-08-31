import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALES, translate, type Locale, type MessageKey } from '@hemvist/shared';

/**
 * Språkhantering.
 *
 * Alla texter i gränssnittet hämtas via `t`. Att lägga till ett språk kräver
 * bara en ny katalog i det delade paketet – ingen ändring i komponenterna.
 */

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  available: readonly Locale[];
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = 'hemvist.locale';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    /* lagring kan vara blockerad */
  }
  const preferred = navigator.language?.slice(0, 2);
  return (LOCALES as readonly string[]).includes(preferred ?? '') ? (preferred as Locale) : DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* lagring kan vara blockerad */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      available: LOCALES,
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n måste användas inom I18nProvider.');
  return value;
}
