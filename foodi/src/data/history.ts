// Exempeldata för restaurang- och adminvyerna: historiska beställningar de
// senaste 30 dagarna och några pågående beställningar hos personalen. Allt
// genereras deterministiskt, så att siffrorna är desamma vid varje laddning.

import type { Customer, Dish, Order, OrderLine, OrderStatus, Restaurant } from '../types';
import { between, pick, seeded } from '../lib/random';
import { addDays, openIntervals, startOfDay } from '../lib/time';
import { defaultSelections, modifiers, serviceFee, unitPrice } from '../store/pricing';
import { SEED_RESTAURANTS } from './restaurants';

const FIRST_NAMES = [
  'Anna', 'Erik', 'Sara', 'Johan', 'Fatima', 'Mohammed', 'Elin', 'Oscar', 'Maja', 'Ali', 'Linnea', 'Hugo',
  'Emma', 'Lucas', 'Amira', 'William', 'Ebba', 'Noah', 'Julia', 'Leo', 'Sofia', 'Adam', 'Alva', 'Omar',
  'Klara', 'Viktor', 'Nora', 'Elias', 'Ida', 'Arvid', 'Leila', 'Isak', 'Hanna', 'Filip', 'Wilma', 'Yusuf',
  'Tove', 'Axel', 'Selma', 'Karim', 'Agnes', 'Gustav', 'Hedda', 'Mustafa', 'Saga', 'Jonas',
];
const LAST_NAMES = [
  'Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson',
  'Gustafsson', 'Lindberg', 'Lindqvist', 'Ahmed', 'Hassan', 'Berg', 'Holm', 'Sandberg', 'Ek', 'Lund',
  'Nyström', 'Öberg', 'Yilmaz', 'Khalil', 'Wallin', 'Sjöberg', 'Engström',
];

export const DEMO_CUSTOMERS: Customer[] = (() => {
  const rand = seeded(4711);
  return Array.from({ length: 180 }, () => {
    const first = pick(rand, FIRST_NAMES);
    const last = pick(rand, LAST_NAMES);
    const prefix = pick(rand, ['070', '072', '073', '076', '079']);
    const digits = String(between(rand, 1_000_000, 9_999_999));
    const phone = `${prefix}${digits}`;
    return {
      name: `${first} ${last}`,
      phone,
      email: rand() < 0.6 ? `${first}.${last}`.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o') + '@example.com' : undefined,
    };
  });
})();

const PAYMENT_METHODS = ['swish', 'swish', 'swish', 'card', 'card', 'wallet'] as const;

function weightedDish(rand: () => number, dishes: Dish[]): Dish {
  const popular = dishes.filter((d) => d.popular);
  return popular.length > 0 && rand() < 0.6 ? pick(rand, popular) : pick(rand, dishes);
}

function buildLines(rand: () => number, r: Restaurant): OrderLine[] {
  const mains = r.dishes.filter((d) => d.price >= 60);
  const count = rand() < 0.55 ? 1 : rand() < 0.75 ? 2 : 3;
  const lines: OrderLine[] = [];
  for (let i = 0; i < count; i++) {
    const dish = i === 0 && mains.length > 0 ? weightedDish(rand, mains) : weightedDish(rand, r.dishes);
    const selections = defaultSelections(dish);
    const extras = (dish.optionGroups ?? []).find((g) => g.kind === 'multi');
    if (extras && rand() < 0.35) {
      const extra = pick(rand, extras.choices);
      selections[extras.id] = [extra.id];
    }
    const existing = lines.find((l) => l.dishId === dish.id);
    if (existing) {
      existing.quantity += 1;
      continue;
    }
    lines.push({
      dishId: dish.id,
      name: dish.name,
      quantity: rand() < 0.15 ? 2 : 1,
      unitPrice: unitPrice(dish, selections),
      modifiers: modifiers(dish, { removed: [], selections }),
      photo: dish.photo,
      emoji: dish.emoji,
    });
  }
  return lines;
}

function orderNumber(rand: () => number): string {
  return `FD-${between(rand, 1000, 9999)}`;
}

const SETTINGS_AT_THE_TIME = { serviceFeePct: 3, serviceFeeCap: 19, defaultCommission: 12, vatPct: 6, autopilot: false };

let cache: { key: number; orders: Order[] } | null = null;

/** Avslutade beställningar de senaste 30 dagarna fram till nu. */
export function orderHistory(now: number, days = 30): Order[] {
  const today = startOfDay(now);
  // Samma timme ger samma data; nya beställningar dyker upp under dagen.
  const key = Math.floor(now / 3_600_000);
  if (cache?.key === key) return cache.orders;

  const orders: Order[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = addDays(today, -d);
    const weekday = (new Date(dayStart).getDay() + 6) % 7;
    const weekdayFactor = [0.8, 0.85, 0.95, 1, 1.35, 1.4, 1.1][weekday] ?? 1;
    const growth = 0.72 + 0.28 * (1 - d / days);

    SEED_RESTAURANTS.forEach((r, ri) => {
      const rand = seeded(Math.floor(dayStart / 86_400_000) * 31 + ri * 7919);
      const intervals = openIntervals(r.hours, dayStart, 0).filter((i) => i.start >= dayStart && i.start < addDays(dayStart, 1));
      if (intervals.length === 0) return;
      const count = Math.round((r.ratingCount / 42) * weekdayFactor * growth * (0.8 + rand() * 0.4));
      for (let i = 0; i < count; i++) {
        const interval = pick(rand, intervals);
        // Lunch och middag väger tyngst.
        const peak = rand() < 0.5 ? 0.25 : 0.65;
        const share = Math.min(0.97, Math.max(0.02, peak + (rand() - 0.5) * 0.5));
        const createdAt = Math.round(interval.start + (interval.end - interval.start) * share);
        if (createdAt > now - 45 * 60_000) continue;

        const lines = buildLines(rand, r);
        const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
        const fee = serviceFee(subtotal, SETTINGS_AT_THE_TIME);
        const scheduled = rand() < 0.18;
        const pickupTime = createdAt + (scheduled ? between(rand, 45, 180) : r.prepMinutes + between(rand, 0, 5)) * 60_000;
        const roll = rand();
        const status: OrderStatus = roll < 0.025 ? 'rejected' : roll < 0.05 ? 'cancelled' : 'picked_up';
        const customer = DEMO_CUSTOMERS[Math.floor(rand() ** 1.6 * DEMO_CUSTOMERS.length)] ?? DEMO_CUSTOMERS[0]!;
        const method = pick(rand, PAYMENT_METHODS);
        const acceptedAt = createdAt + between(rand, 1, 4) * 60_000;
        const history: Order['history'] =
          status === 'picked_up'
            ? [
                { status: 'placed', at: createdAt },
                { status: 'accepted', at: acceptedAt },
                { status: 'preparing', at: Math.max(acceptedAt, pickupTime - r.prepMinutes * 60_000) },
                { status: 'ready', at: pickupTime - between(rand, 0, 3) * 60_000 },
                { status: 'picked_up', at: pickupTime + between(rand, 1, 12) * 60_000 },
              ]
            : [
                { status: 'placed', at: createdAt },
                { status, at: createdAt + between(rand, 1, 5) * 60_000 },
              ];
        orders.push({
          id: `h-${r.id}-${dayStart}-${i}`,
          number: orderNumber(rand),
          origin: 'demo',
          restaurantId: r.id,
          createdAt,
          pickup: { mode: scheduled ? 'scheduled' : 'asap', time: pickupTime },
          confirmedTime: status === 'picked_up' ? pickupTime : undefined,
          status,
          history,
          lines,
          subtotal,
          serviceFee: fee,
          total: subtotal + fee,
          commission: r.commission,
          vatPct: 6,
          payment: {
            method,
            paidAt: createdAt,
            reference: method === 'card' ? '•••• 4242' : `SW${between(rand, 100000, 999999)}`,
            refundedAt: status === 'picked_up' ? undefined : createdAt + 5 * 60_000,
          },
          customer,
          rejectReason: status === 'rejected' ? pick(rand, ['Slutsålt', 'Hög belastning i köket', 'Stänger snart']) : undefined,
          autopilot: false,
          rating: status === 'picked_up' && rand() < 0.35 ? (rand() < 0.75 ? 5 : rand() < 0.7 ? 4 : 3) : undefined,
          notices: [],
        });
      }
    });
  }
  orders.sort((a, b) => b.createdAt - a.createdAt);
  cache = { key, orders };
  return orders;
}

/** Pågående beställningar hos några restauranger, så att personalvyn har något att visa. */
export function demoActiveOrders(restaurants: Restaurant[], now: number): Order[] {
  const rand = seeded(Math.floor(now / 60_000));
  const minute = 60_000;
  const specs: {
    restaurantId: string;
    status: OrderStatus;
    ageMin: number;
    pickupInMin: number;
    scheduled?: boolean;
    items: [string, number, Record<string, string[]>?, string[]?][];
    note?: string;
  }[] = [
    {
      restaurantId: 'presto-grillen',
      status: 'placed',
      ageMin: 1,
      pickupInMin: 15,
      items: [
        ['pg-presto-burger', 1, { 'pg-stekgrad': ['medium'], 'pg-extra': ['extra-ost'], 'pg-dryck': ['cola'] }, ['lok']],
        ['pg-pommes', 1, { 'pg-dipp': ['aioli'] }],
      ],
      note: 'Jag är allergisk mot sesam.',
    },
    {
      restaurantId: 'presto-grillen',
      status: 'preparing',
      ageMin: 9,
      pickupInMin: 7,
      items: [['pg-kottbullar', 2, { 'pg-tillbehor': ['mos'] }]],
    },
    {
      restaurantId: 'presto-grillen',
      status: 'ready',
      ageMin: 18,
      pickupInMin: -2,
      items: [['pg-crispy-chicken', 1, { 'pg-dryck': ['loka'] }]],
    },
    {
      restaurantId: 'presto-grillen',
      status: 'accepted',
      ageMin: 4,
      pickupInMin: 50,
      scheduled: true,
      items: [
        ['pg-wallenbergare', 1, { 'pg-tillbehor': ['mos'] }],
        ['pg-caesar', 1, {}],
      ],
    },
    {
      restaurantId: 'napoli-forno',
      status: 'placed',
      ageMin: 2,
      pickupInMin: 12,
      items: [
        ['nf-margherita', 1, { 'nf-botten': ['klassisk'], 'nf-extra': ['burrata'] }],
        ['nf-diavola', 1, { 'nf-botten': ['klassisk'] }],
      ],
    },
    {
      restaurantId: 'beirut-street',
      status: 'preparing',
      ageMin: 6,
      pickupInMin: 4,
      items: [['bs-falafelrulle', 2, { 'bs-styrka': ['stark'] }]],
    },
  ];

  return specs.flatMap((spec, index) => {
    const r = restaurants.find((x) => x.id === spec.restaurantId);
    if (!r) return [];
    const lines: OrderLine[] = spec.items.flatMap(([dishId, quantity, selections = {}, removed = []]) => {
      const dish = r.dishes.find((d) => d.id === dishId);
      if (!dish) return [];
      const full = { ...defaultSelections(dish), ...selections };
      return [
        {
          dishId,
          name: dish.name,
          quantity,
          unitPrice: unitPrice(dish, full),
          modifiers: modifiers(dish, { removed, selections: full }),
          photo: dish.photo,
          emoji: dish.emoji,
        },
      ];
    });
    const createdAt = now - spec.ageMin * minute;
    const pickupTime = Math.ceil((now + spec.pickupInMin * minute) / (5 * minute)) * 5 * minute;
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const fee = serviceFee(subtotal, SETTINGS_AT_THE_TIME);
    const flow: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];
    const reached = flow.slice(0, flow.indexOf(spec.status) + 1);
    const customer = DEMO_CUSTOMERS[(index * 37 + 11) % DEMO_CUSTOMERS.length]!;
    const order: Order = {
      id: `demo-${spec.restaurantId}-${index}`,
      number: orderNumber(rand),
      origin: 'demo',
      restaurantId: r.id,
      createdAt,
      pickup: { mode: spec.scheduled ? 'scheduled' : 'asap', time: pickupTime },
      confirmedTime: spec.status === 'placed' ? undefined : pickupTime,
      status: spec.status,
      history: reached.map((status, i) => ({ status, at: createdAt + i * Math.round((spec.ageMin * minute) / reached.length) })),
      lines,
      subtotal,
      serviceFee: fee,
      total: subtotal + fee,
      commission: r.commission,
      vatPct: 6,
      payment: { method: 'swish', paidAt: createdAt, reference: `SW${between(rand, 100000, 999999)}` },
      customer,
      note: spec.note,
      autopilot: false,
      notices: [],
    };
    return [order];
  });
}
