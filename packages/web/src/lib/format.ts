import { formatAmount, formatDate, formatDateTime, formatDayMonth, formatTime, type Locale } from '@hemvist/shared';

export { formatAmount, formatDate, formatDateTime, formatDayMonth, formatTime };

/** Relativ tid för listor: "för 5 min sedan", "i går". */
export function relativeTime(value: string | Date, locale: Locale = 'sv'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return locale === 'en' ? 'just now' : 'nyss';
  if (minutes < 60) return locale === 'en' ? `${minutes} min ago` : `för ${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === 'en' ? `${hours} h ago` : `för ${hours} tim sedan`;
  const days = Math.round(hours / 24);
  if (days === 1) return locale === 'en' ? 'yesterday' : 'i går';
  if (days < 7) return locale === 'en' ? `${days} days ago` : `för ${days} dagar sedan`;
  return formatDate(date);
}

/** "torsdag 4 september" – används i bokningar och driftinformation. */
export function longDate(value: string | Date, locale: Locale = 'sv'): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const weekday = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'sv-SE', {
    weekday: 'long',
    timeZone: 'Europe/Stockholm',
  }).format(date);
  return `${weekday} ${formatDayMonth(date, locale)}`;
}

export function timeRange(from: string | Date, to: string | Date): string {
  return `${formatTime(from)}–${formatTime(to)}`;
}

export function isToday(value: string | Date): boolean {
  return formatDate(value) === formatDate(new Date());
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
