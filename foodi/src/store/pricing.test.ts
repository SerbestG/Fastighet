import { describe, expect, it } from 'vitest';
import { SEED_RESTAURANTS } from '../data/restaurants';
import { DEFAULT_SETTINGS } from './store';
import { cartTotals, defaultSelections, modifiers, sameConfiguration, serviceFee, validateSelections } from './pricing';

const presto = SEED_RESTAURANTS.find((r) => r.id === 'presto-grillen')!;
const burger = presto.dishes.find((d) => d.id === 'pg-presto-burger')!;

describe('priser', () => {
  it('räknar Presto Burger med extra ost och dryck som i skissen', () => {
    const selections = { ...defaultSelections(burger), 'pg-extra': ['extra-ost'], 'pg-dryck': ['cola'] };
    const totals = cartTotals(
      { restaurantId: presto.id, lines: [{ id: 'a', dishId: burger.id, quantity: 1, removed: [], selections }] },
      presto,
      DEFAULT_SETTINGS,
    );
    expect(totals.subtotal).toBe(164);
    expect(totals.serviceFee).toBe(5);
    expect(totals.total).toBe(169);
  });

  it('har ett tak för serviceavgiften', () => {
    expect(serviceFee(2000, DEFAULT_SETTINGS)).toBe(19);
    expect(serviceFee(0, DEFAULT_SETTINGS)).toBe(0);
  });

  it('räknar inte med slutsålda rätter', () => {
    const soldOut = { ...presto, dishes: presto.dishes.map((d) => (d.id === burger.id ? { ...d, soldOut: true } : d)) };
    const totals = cartTotals(
      { restaurantId: presto.id, lines: [{ id: 'a', dishId: burger.id, quantity: 2, removed: [], selections: {} }] },
      soldOut,
      DEFAULT_SETTINGS,
    );
    expect(totals.subtotal).toBe(0);
    expect(totals.hasUnavailable).toBe(true);
  });

  it('beskriver bortvalda ingredienser och tillval', () => {
    const selections = { ...defaultSelections(burger), 'pg-extra': ['extra-ost'] };
    expect(modifiers(burger, { removed: ['lok'], selections })).toEqual(['Medium – rosa i mitten', '+ Extra ost', 'Utan lök']);
  });

  it('kräver obligatoriska val', () => {
    expect(validateSelections(burger, { 'pg-stekgrad': [] })).toHaveProperty('pg-stekgrad');
    expect(validateSelections(burger, defaultSelections(burger))).toEqual({});
  });

  it('slår ihop rader med samma val oavsett ordning', () => {
    const a = { dishId: 'x', removed: ['a', 'b'], selections: { g: ['1', '2'] } };
    const b = { dishId: 'x', removed: ['b', 'a'], selections: { g: ['2', '1'] } };
    expect(sameConfiguration(a, b)).toBe(true);
    expect(sameConfiguration(a, { ...b, comment: 'Utan salt' })).toBe(false);
  });
});
