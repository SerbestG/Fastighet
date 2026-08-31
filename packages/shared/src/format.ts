import type { Locale } from './domain.js';

/**
 * Datum och klockslag visas enligt svensk standard: åååå-mm-dd och tt.mm
 * (krav A.2.9). Tidszonen är Europe/Stockholm om inget annat anges.
 */
export const APP_TIME_ZONE = 'Europe/Stockholm';

const dateParts = (value: Date | string, timeZone: string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const out: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
};

export function formatDate(value: Date | string, timeZone = APP_TIME_ZONE): string {
  const p = dateParts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatTime(value: Date | string, timeZone = APP_TIME_ZONE): string {
  const p = dateParts(value, timeZone);
  return `${p.hour}.${p.minute}`;
}

export function formatDateTime(value: Date | string, timeZone = APP_TIME_ZONE): string {
  return `${formatDate(value, timeZone)} ${formatTime(value, timeZone)}`;
}

const MONTHS_SV = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Läsvänligt datum, t.ex. "10 september" – används i tidslinjer. */
export function formatDayMonth(value: Date | string, locale: Locale = 'sv'): string {
  const p = dateParts(value, APP_TIME_ZONE);
  const monthIndex = Number(p.month) - 1;
  const months = locale === 'en' ? MONTHS_EN : MONTHS_SV;
  const day = String(Number(p.day));
  return locale === 'en' ? `${months[monthIndex]} ${day}` : `${day} ${months[monthIndex]}`;
}

/** Belopp lagras i ören för att undvika avrundningsfel. */
export function formatAmount(ore: number, locale: Locale = 'sv'): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: ore % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(ore / 100);
}

export function formatDurationHours(hours: number, locale: Locale = 'sv'): string {
  if (!Number.isFinite(hours)) return '–';
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return locale === 'en' ? `${minutes} min` : `${minutes} min`;
  }
  if (hours < 48) {
    const rounded = Math.round(hours * 10) / 10;
    return locale === 'en' ? `${rounded} h` : `${rounded} tim`;
  }
  const days = Math.round((hours / 24) * 10) / 10;
  return locale === 'en' ? `${days} days` : `${days} dygn`;
}

/** Enkel initialbaserad avatartext, aldrig personnummer eller e-post. */
export function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}
