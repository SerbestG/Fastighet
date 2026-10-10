import { describe, expect, it } from 'vitest';
import { SEED_RESTAURANTS } from '../data/restaurants';
import { asapTime, isPickupTimeValid, openState, pickupSlots, startOfDay } from './time';

const beirut = SEED_RESTAURANTS.find((r) => r.id === 'beirut-street')!;
const mormor = SEED_RESTAURANTS.find((r) => r.id === 'mormors-kok')!;

// 10 oktober 2026 är en lördag.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

describe('öppettider', () => {
  it('räknar ett pass efter midnatt till dagen det öppnade', () => {
    expect(openState(beirut, at(10, 1, 30)).open).toBe(true); // fredag kväll, öppet till 03
    expect(openState(beirut, at(11, 2, 30)).open).toBe(true); // lördag kväll
    expect(openState(beirut, at(12, 0, 30)).open).toBe(false); // söndag stänger 00
  });

  it('anger när en stängd restaurang öppnar', () => {
    const state = openState(mormor, at(11, 12)); // söndag, stängt
    expect(state.open).toBe(false);
    if (!state.open) expect(state.opensAt).toBe(at(12, 10, 30));
  });

  it('respekterar en paus', () => {
    const paused = { ...beirut, pausedUntil: at(10, 13) };
    const state = openState(paused, at(10, 12));
    expect(state.open).toBe(false);
    if (!state.open) expect(state.reason).toBe('paused');
  });
});

describe('hämttider', () => {
  it('erbjuder inte "så snart som möjligt" strax före stängning', () => {
    expect(asapTime(mormor, at(12, 18, 50))).toBeNull();
    expect(asapTime(mormor, at(12, 12, 0))).toBe(at(12, 12, 10));
  });

  it('ger tider i kvartssteg inom öppettiden', () => {
    const now = at(12, 12, 3);
    const slots = pickupSlots(mormor, startOfDay(now), now);
    expect(slots[0]).toBe(at(12, 12, 15));
    expect(slots[slots.length - 1]).toBe(at(12, 18, 45));
    expect(slots.every((t) => new Date(t).getMinutes() % 15 === 0)).toBe(true);
  });

  it('tar med sena tider efter midnatt på rätt kalenderdag', () => {
    const now = at(10, 0, 20);
    const slots = pickupSlots(beirut, startOfDay(now), now);
    expect(slots[0]).toBe(at(10, 0, 30));
    expect(slots).toContain(at(10, 2, 45));
    expect(slots).not.toContain(at(10, 3, 0));
  });

  it('godkänner bara tider som går att välja', () => {
    const now = at(12, 12, 3);
    expect(isPickupTimeValid(mormor, at(12, 13, 0), now)).toBe(true);
    expect(isPickupTimeValid(mormor, at(12, 20, 0), now)).toBe(false);
  });
});
