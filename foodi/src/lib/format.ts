// Formatering enligt svensk praxis: "1 024 kr", "4,6", "1,2 km", "kl. 18:45".

const numberFormat = new Intl.NumberFormat('sv-SE');

export function kr(amount: number): string {
  return `${numberFormat.format(Math.round(amount))} kr`;
}

export function num(n: number): string {
  return numberFormat.format(n);
}

export function decimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

export function distance(meters: number): string {
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  if (meters < 10000) return `${decimal(meters / 1000)} km`;
  return `${Math.round(meters / 1000)} km`;
}

export function clock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const WEEKDAYS_LONG = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag'];

export function shortDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayShort(t: number): string {
  return WEEKDAYS_SHORT[new Date(t).getDay()] ?? '';
}

function dayOffset(t: number, now: number): number {
  const a = new Date(t);
  const b = new Date(now);
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / 86_400_000);
}

/** "Idag", "Imorgon", "Igår" eller "Måndag 12 okt". */
export function dayLabel(t: number, now: number): string {
  const offset = dayOffset(t, now);
  if (offset === 0) return 'Idag';
  if (offset === 1) return 'Imorgon';
  if (offset === -1) return 'Igår';
  return `${WEEKDAYS_LONG[new Date(t).getDay()]} ${shortDate(t)}`;
}

/** "idag 18:45", "imorgon 12:15", "fre 9 okt 12:15". */
export function when(t: number, now: number): string {
  const offset = dayOffset(t, now);
  if (offset === 0) return `idag ${clock(t)}`;
  if (offset === 1) return `imorgon ${clock(t)}`;
  if (offset === -1) return `igår ${clock(t)}`;
  return `${weekdayShort(t)} ${shortDate(t)} ${clock(t)}`;
}

/** "om 14 min", "om 1 tim 5 min", "nu". */
export function inMinutes(t: number, now: number): string {
  const minutes = Math.round((t - now) / 60_000);
  if (minutes <= 0) return 'nu';
  if (minutes < 60) return `om ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `om ${h} tim` : `om ${h} tim ${m} min`;
}

export function minutesAgo(t: number, now: number): string {
  const minutes = Math.round((now - t) / 60_000);
  if (minutes < 1) return 'nyss';
  if (minutes < 60) return `${minutes} min sedan`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} tim sedan`;
  return shortDate(t);
}

/** 0701234567 → 070-123 45 67 */
export function phone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^46/, '0');
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
}

/** 0701234567 → 070-123 •• 67, för listor där hela numret inte behövs. */
export function maskedPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^46/, '0');
  if (digits.length !== 10) return raw;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)} •• ${digits.slice(8)}`;
}

export function isMobileNumber(raw: string): boolean {
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+46/, '0');
  return /^07[02369]\d{7}$/.test(digits);
}

export function plural(n: number, one: string, many: string): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

export function priceLevel(level: number): string {
  return 'kr '.repeat(level).trim();
}
