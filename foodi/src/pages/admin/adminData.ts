// Nyckeltal för adminvyn, beräknade på exempelhistoriken plus beställningar
// som lagts i den här webbläsaren.

import { useMemo } from 'react';
import type { Order, Restaurant } from '../../types';
import { orderHistory } from '../../data/history';
import { useAppState } from '../../store/store';
import { addDays, startOfDay } from '../../lib/time';

export function countsAsSale(o: Order): boolean {
  return o.status !== 'rejected' && o.status !== 'cancelled';
}

/** Foodis intäkt på en order: provision på matpriset plus kundens serviceavgift. */
export function platformRevenue(o: Order): number {
  return countsAsSale(o) ? (o.subtotal * o.commission) / 100 + o.serviceFee : 0;
}

export function useAllOrders(now: number): Order[] {
  const { orders } = useAppState();
  // Historiken byts bara varje timme; nya beställningar kommer via orders.
  const hour = Math.floor(now / 3_600_000);
  return useMemo(() => {
    const history = orderHistory(hour * 3_600_000);
    const ids = new Set(orders.map((o) => o.id));
    return [...orders, ...history.filter((h) => !ids.has(h.id))].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, hour]);
}

export interface Totals {
  orders: number;
  value: number;
  revenue: number;
  average: number;
}

export function totals(list: Order[]): Totals {
  const sales = list.filter(countsAsSale);
  const value = sales.reduce((s, o) => s + o.subtotal, 0);
  return {
    orders: sales.length,
    value,
    revenue: sales.reduce((s, o) => s + platformRevenue(o), 0),
    average: sales.length ? value / sales.length : 0,
  };
}

export function inRange(list: Order[], from: number, to: number): Order[] {
  return list.filter((o) => o.createdAt >= from && o.createdAt < to);
}

export interface DayPoint {
  dayStart: number;
  orders: number;
  value: number;
}

export function dailySeries(list: Order[], now: number, days: number): DayPoint[] {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, i) => {
    const dayStart = addDays(today, i - days + 1);
    const t = totals(inRange(list, dayStart, addDays(dayStart, 1)));
    return { dayStart, orders: t.orders, value: t.value };
  });
}

export interface RestaurantStats {
  restaurant: Restaurant;
  orders: number;
  value: number;
  commission: number;
  rating: number;
}

export function restaurantStats(list: Order[], restaurants: Restaurant[], from: number): RestaurantStats[] {
  return restaurants
    .map((r) => {
      const own = list.filter((o) => o.restaurantId === r.id && o.createdAt >= from && countsAsSale(o));
      const value = own.reduce((s, o) => s + o.subtotal, 0);
      return {
        restaurant: r,
        orders: own.length,
        value,
        commission: own.reduce((s, o) => s + (o.subtotal * o.commission) / 100, 0),
        rating: r.rating,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface CustomerStats {
  name: string;
  phone: string;
  email?: string;
  orders: number;
  spent: number;
  lastOrder: number;
  favourite: string;
}

export function customerStats(list: Order[], restaurants: Restaurant[]): CustomerStats[] {
  const map = new Map<string, { name: string; phone: string; email?: string; orders: number; spent: number; lastOrder: number; places: Record<string, number> }>();
  for (const o of list) {
    if (!countsAsSale(o)) continue;
    const key = o.customer.phone;
    const entry = map.get(key) ?? { name: o.customer.name, phone: key, email: o.customer.email, orders: 0, spent: 0, lastOrder: 0, places: {} };
    entry.orders += 1;
    entry.spent += o.total;
    entry.lastOrder = Math.max(entry.lastOrder, o.createdAt);
    entry.places[o.restaurantId] = (entry.places[o.restaurantId] ?? 0) + 1;
    map.set(key, entry);
  }
  return [...map.values()]
    .map((e) => {
      const top = Object.entries(e.places).sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        name: e.name,
        phone: e.phone,
        email: e.email,
        orders: e.orders,
        spent: e.spent,
        lastOrder: e.lastOrder,
        favourite: restaurants.find((r) => r.id === top)?.name ?? '–',
      };
    })
    .sort((a, b) => b.lastOrder - a.lastOrder);
}

/** "48 120 kr", "312 tkr", "1,2 mkr" – kompakt för stora belopp. */
export function compactKr(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mkr`;
  if (n >= 100_000) return `${Math.round(n / 1000)} tkr`;
  return `${new Intl.NumberFormat('sv-SE').format(Math.round(n))} kr`;
}
