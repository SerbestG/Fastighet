// Sökning och filtrering av restauranger, gemensamt för startsidan och söksidan.

import type { CuisineId, Dish, Restaurant } from '../types';
import { openState } from '../lib/time';
import { distanceTo, type LocationPoint } from './hooks';

export type SortKey = 'distance' | 'fastest' | 'rating';

export interface DiscoveryFilters {
  query: string;
  cuisine: 'alla' | CuisineId;
  prices: number[];
  maxPrep: number | null;
  openNow: boolean;
  veg: boolean;
  minRating: number | null;
  sort: SortKey;
}

export const EMPTY_FILTERS: DiscoveryFilters = {
  query: '',
  cuisine: 'alla',
  prices: [],
  maxPrep: null,
  openNow: false,
  veg: false,
  minRating: null,
  sort: 'distance',
};

export interface DiscoveryResult {
  restaurant: Restaurant;
  meters: number;
  open: boolean;
  /** Rätten som gjorde att restaurangen matchade sökningen. */
  match?: string;
  dishMatches: Dish[];
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function isVegFriendly(r: Restaurant): boolean {
  return r.categories.includes('vegetariskt') || r.dishes.filter((d) => d.tags?.some((t) => t === 'vegansk' || t === 'vegetarisk')).length >= 3;
}

export function countActiveFilters(f: DiscoveryFilters): number {
  return (
    (f.cuisine !== 'alla' ? 1 : 0) +
    (f.prices.length > 0 ? 1 : 0) +
    (f.maxPrep !== null ? 1 : 0) +
    (f.openNow ? 1 : 0) +
    (f.veg ? 1 : 0) +
    (f.minRating !== null ? 1 : 0)
  );
}

export function discover(restaurants: Restaurant[], point: LocationPoint, now: number, f: DiscoveryFilters): DiscoveryResult[] {
  const q = normalize(f.query);
  const results: DiscoveryResult[] = [];
  for (const restaurant of restaurants) {
    if (restaurant.suspended) continue;
    const open = openState(restaurant, now).open;
    if (f.cuisine !== 'alla' && !restaurant.categories.includes(f.cuisine)) continue;
    if (f.prices.length > 0 && !f.prices.includes(restaurant.priceLevel)) continue;
    if (f.maxPrep !== null && restaurant.prepMinutes > f.maxPrep) continue;
    if (f.openNow && !open) continue;
    if (f.veg && !isVegFriendly(restaurant)) continue;
    if (f.minRating !== null && restaurant.rating < f.minRating) continue;

    let match: string | undefined;
    let dishMatches: Dish[] = [];
    if (q) {
      const own = [restaurant.name, restaurant.tagline, ...restaurant.cuisines].some((t) => normalize(t).includes(q));
      dishMatches = restaurant.dishes.filter((d) => normalize(d.name).includes(q) || normalize(d.description).includes(q));
      if (!own && dishMatches.length === 0) continue;
      if (!own) match = dishMatches.slice(0, 2).map((d) => d.name).join(', ');
    }
    results.push({ restaurant, meters: distanceTo(restaurant, point), open, match, dishMatches });
  }
  const key: Record<SortKey, (r: DiscoveryResult) => number> = {
    distance: (r) => r.meters,
    fastest: (r) => r.restaurant.prepMinutes * 1000 + r.meters / 100,
    rating: (r) => -r.restaurant.rating * 1000 + r.meters / 1000,
  };
  return results.sort((a, b) => Number(b.open) - Number(a.open) || key[f.sort](a) - key[f.sort](b));
}
