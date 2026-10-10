// Öppettider och hämttider. Tider räknas i enhetens lokala tid, som för en svensk
// kund är svensk tid. Ett öppetpass som stänger efter midnatt hör till dagen det
// öppnade.

import type { Restaurant, WeekHours } from '../types';

export const WEEKDAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];

const MINUTE = 60_000;
const SLOT_MINUTES = 15;
/** Sista hämttid ligger så här långt före stängning. */
const LAST_PICKUP_BEFORE_CLOSE = 10 * MINUTE;

export interface Interval {
  start: number;
  end: number;
}

export function weekdayIndex(t: number): number {
  return (new Date(t).getDay() + 6) % 7;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(t: number, days: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes()).getTime();
}

function parseHm(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

function at(dayStart: number, minutes: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
}

export function roundUp(t: number, minutes: number): number {
  const step = minutes * MINUTE;
  return Math.ceil(t / step) * step;
}

/** Öppetpass från dagen före `from` och `days` dagar framåt. */
export function openIntervals(hours: WeekHours, from: number, days: number): Interval[] {
  const first = startOfDay(from);
  const result: Interval[] = [];
  for (let i = -1; i <= days; i++) {
    const day = addDays(first, i);
    const span = hours[weekdayIndex(day)];
    if (!span) continue;
    const open = parseHm(span.open);
    let close = parseHm(span.close);
    if (close <= open) close += 24 * 60;
    result.push({ start: at(day, open), end: at(day, close) });
  }
  return result;
}

export function currentInterval(hours: WeekHours, t: number): Interval | null {
  return openIntervals(hours, t, 1).find((i) => t >= i.start && t < i.end) ?? null;
}

export function nextOpening(hours: WeekHours, t: number): number | null {
  const next = openIntervals(hours, t, 8).find((i) => i.start > t);
  return next ? next.start : null;
}

export type OpenState =
  | { open: true; closesAt: number }
  | { open: false; reason: 'closed' | 'paused' | 'suspended'; opensAt: number | null };

export function openState(r: Restaurant, now: number): OpenState {
  if (r.suspended) return { open: false, reason: 'suspended', opensAt: null };
  const interval = currentInterval(r.hours, now);
  if (interval && r.pausedUntil && r.pausedUntil > now) {
    return { open: false, reason: 'paused', opensAt: Math.min(r.pausedUntil, interval.end) };
  }
  if (interval) return { open: true, closesAt: interval.end };
  return { open: false, reason: 'closed', opensAt: nextOpening(r.hours, now) };
}

/** Tidigaste hämttid om kunden beställer nu, eller null om det inte går. */
export function asapTime(r: Restaurant, now: number): number | null {
  const state = openState(r, now);
  if (!state.open) return null;
  const ready = roundUp(now + r.prepMinutes * MINUTE, 5);
  return ready <= state.closesAt - LAST_PICKUP_BEFORE_CLOSE ? ready : null;
}

/** Bokningsbara hämttider en viss kalenderdag, i steg om 15 minuter. */
export function pickupSlots(r: Restaurant, dayStart: number, now: number): number[] {
  if (r.suspended) return [];
  const dayEnd = addDays(dayStart, 1);
  const earliest = roundUp(now + Math.max(r.prepMinutes, 10) * MINUTE, SLOT_MINUTES);
  const slots: number[] = [];
  for (const interval of openIntervals(r.hours, dayStart, 1)) {
    const from = Math.max(interval.start + r.prepMinutes * MINUTE, dayStart, earliest);
    const to = Math.min(interval.end - LAST_PICKUP_BEFORE_CLOSE, dayEnd - 1);
    for (let t = roundUp(from, SLOT_MINUTES); t <= to; t += SLOT_MINUTES * MINUTE) {
      if (r.pausedUntil && t < r.pausedUntil) continue;
      slots.push(t);
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

export interface PickupDay {
  dayStart: number;
  slots: number[];
}

/** Idag och två dagar framåt, med de tider som går att välja. */
export function pickupDays(r: Restaurant, now: number, count = 3): PickupDay[] {
  const today = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    const dayStart = addDays(today, i);
    return { dayStart, slots: pickupSlots(r, dayStart, now) };
  });
}

/** Kan restaurangen ta emot en beställning för den här tiden? */
export function isPickupTimeValid(r: Restaurant, time: number, now: number): boolean {
  const asap = asapTime(r, now);
  if (asap !== null && Math.abs(asap - time) < MINUTE) return true;
  return pickupSlots(r, startOfDay(time), now).includes(time);
}

export function formatSpan(span: { open: string; close: string } | null | undefined): string {
  if (!span) return 'Stängt';
  return `${span.open}–${span.close}`;
}
