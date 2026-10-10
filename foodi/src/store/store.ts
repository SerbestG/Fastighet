// Prototypens tillstånd. Allt sparas i webbläsarens lokala lagring och delas
// mellan flikar, så att kundvyn, restaurangvyn och adminvyn ser samma
// beställningar. Ett riktigt API ersätter den här modulen.

import { useSyncExternalStore } from 'react';
import type {
  Cart,
  CartLine,
  Customer,
  Dish,
  Notice,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  PlatformSettings,
  Restaurant,
  UserLocation,
} from '../types';
import { SEED_RESTAURANTS } from '../data/restaurants';
import { DEFAULT_AREA } from '../data/areas';
import { demoActiveOrders } from '../data/history';
import { readJson, remove, writeJson } from '../lib/storage';
import { between, seeded, uid } from '../lib/random';
import { clock, when } from '../lib/format';
import { cartTotals, sameConfiguration } from './pricing';

const STORAGE_KEY = 'foodi:state';
/** Höjs när exempeldatan ändras på ett sätt som kräver att sparat tillstånd nollställs. */
const DATA_VERSION = 3;

export interface AppState {
  version: number;
  location: UserLocation;
  /** Kunden har själv valt område eller plats. */
  locationChosen: boolean;
  favorites: string[];
  cart: Cart | null;
  orders: Order[];
  restaurants: Restaurant[];
  settings: PlatformSettings;
  customer: Customer | null;
  dismissed: string[];
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  serviceFeePct: 3,
  serviceFeeCap: 19,
  defaultCommission: 12,
  vatPct: 6,
  autopilot: true,
};

function initialState(now: number): AppState {
  const restaurants = structuredClone(SEED_RESTAURANTS);
  return {
    version: DATA_VERSION,
    location: { kind: 'area', areaId: DEFAULT_AREA },
    locationChosen: false,
    favorites: [],
    cart: null,
    orders: demoActiveOrders(restaurants, now),
    restaurants,
    settings: { ...DEFAULT_SETTINGS },
    customer: null,
    dismissed: [],
  };
}

const ACTIVE: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

export function isActive(order: Order): boolean {
  return ACTIVE.includes(order.status);
}

/** Exempelordrar hos personalen förnyas om de har blivit gamla sedan förra besöket. */
function refreshDemoOrders(s: AppState, now: number): AppState {
  const stale = s.orders.some((o) => o.origin === 'demo' && isActive(o) && now - o.createdAt > 3 * 3_600_000);
  const hasDemo = s.orders.some((o) => o.origin === 'demo');
  if (!stale && hasDemo) return s;
  const kept = s.orders.filter((o) => o.origin !== 'demo' || (!isActive(o) && now - o.createdAt < 24 * 3_600_000));
  return { ...s, orders: [...demoActiveOrders(s.restaurants, now), ...kept] };
}

function load(): AppState {
  const now = Date.now();
  const saved = readJson<AppState>(STORAGE_KEY);
  if (!saved || saved.version !== DATA_VERSION) return initialState(now);
  return refreshDemoOrders({ ...initialState(now), ...saved }, now);
}

let state: AppState = load();
const listeners = new Set<() => void>();
let lastSaveFailed = false;

function emit() {
  for (const listener of listeners) listener();
}

function persist() {
  lastSaveFailed = !writeJson(STORAGE_KEY, state);
}

function setState(update: (s: AppState) => AppState) {
  const next = update(state);
  if (next === state) return;
  state = next;
  persist();
  emit();
}

if (typeof window !== 'undefined') {
  // Ändringar från en annan flik (t.ex. restaurangvyn) slår igenom direkt.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const saved = readJson<AppState>(STORAGE_KEY);
    if (saved && saved.version === DATA_VERSION) {
      state = saved;
      emit();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Sant om senaste sparningen misslyckades, t.ex. för att lagringen är full. */
export function saveFailed(): boolean {
  return lastSaveFailed;
}

// ---------------------------------------------------------------------------
// Plats, favoriter och kunduppgifter
// ---------------------------------------------------------------------------

export function setLocation(location: UserLocation) {
  setState((s) => ({ ...s, location, locationChosen: true }));
}

export function toggleFavorite(restaurantId: string): boolean {
  const adding = !state.favorites.includes(restaurantId);
  setState((s) => ({
    ...s,
    favorites: adding ? [...s.favorites, restaurantId] : s.favorites.filter((id) => id !== restaurantId),
  }));
  return adding;
}

export function rememberCustomer(customer: Customer | null) {
  setState((s) => ({ ...s, customer }));
}

export function dismiss(key: string) {
  setState((s) => (s.dismissed.includes(key) ? s : { ...s, dismissed: [...s.dismissed, key] }));
}

// ---------------------------------------------------------------------------
// Varukorg
// ---------------------------------------------------------------------------

export type NewCartLine = Omit<CartLine, 'id'>;

/** Lägger till en rad. Returnerar false om varukorgen redan gäller en annan restaurang. */
export function addToCart(restaurantId: string, line: NewCartLine, options: { replace?: boolean } = {}): boolean {
  if (state.cart && state.cart.restaurantId !== restaurantId && state.cart.lines.length > 0 && !options.replace) {
    return false;
  }
  setState((s) => {
    const cart: Cart =
      s.cart && s.cart.restaurantId === restaurantId && !options.replace ? s.cart : { restaurantId, lines: [] };
    const existing = cart.lines.find((l) => sameConfiguration(l, line));
    const lines = existing
      ? cart.lines.map((l) => (l === existing ? { ...l, quantity: l.quantity + line.quantity } : l))
      : [...cart.lines, { ...line, id: uid() }];
    return { ...s, cart: { ...cart, lines } };
  });
  return true;
}

export function updateCartLine(lineId: string, line: NewCartLine) {
  setState((s) => {
    if (!s.cart) return s;
    return { ...s, cart: { ...s.cart, lines: s.cart.lines.map((l) => (l.id === lineId ? { ...line, id: lineId } : l)) } };
  });
}

export function setLineQuantity(lineId: string, quantity: number) {
  setState((s) => {
    if (!s.cart) return s;
    const lines =
      quantity <= 0 ? s.cart.lines.filter((l) => l.id !== lineId) : s.cart.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l));
    return { ...s, cart: lines.length > 0 ? { ...s.cart, lines } : null };
  });
}

export function clearCart() {
  setState((s) => ({ ...s, cart: null }));
}

// ---------------------------------------------------------------------------
// Beställningar
// ---------------------------------------------------------------------------

export interface PlaceOrderInput {
  pickup: { mode: 'asap' | 'scheduled'; time: number };
  customer: Customer;
  method: PaymentMethod;
  note?: string;
  remember: boolean;
}

function newOrderNumber(existing: Order[]): string {
  const rand = seeded(Date.now());
  for (;;) {
    const number = `FD-${between(rand, 1000, 9999)}`;
    if (!existing.some((o) => o.number === number)) return number;
  }
}

function paymentReference(method: PaymentMethod): string {
  if (method === 'card') return '•••• 4242';
  if (method === 'wallet') return 'Plånbok •••• 0019';
  return `SW${Math.floor(100000 + Math.random() * 900000)}`;
}

export function placeOrder(input: PlaceOrderInput): Order {
  const s = state;
  if (!s.cart) throw new Error('Varukorgen är tom');
  const restaurant = s.restaurants.find((r) => r.id === s.cart?.restaurantId);
  if (!restaurant) throw new Error('Restaurangen finns inte längre');
  const totals = cartTotals(s.cart, restaurant, s.settings);
  const now = Date.now();
  const lines: OrderLine[] = totals.lines
    .filter((l) => !l.unavailable && l.dish)
    .map((l) => ({
      dishId: l.line.dishId,
      name: (l.dish as Dish).name,
      quantity: l.line.quantity,
      unitPrice: l.unit,
      modifiers: l.modifiers,
      comment: l.line.comment,
      photo: (l.dish as Dish).photo,
      emoji: (l.dish as Dish).emoji,
    }));
  const order: Order = {
    id: uid(),
    number: newOrderNumber(s.orders),
    origin: 'customer',
    restaurantId: restaurant.id,
    createdAt: now,
    pickup: input.pickup,
    status: 'placed',
    history: [{ status: 'placed', at: now }],
    lines,
    subtotal: totals.subtotal,
    serviceFee: totals.serviceFee,
    total: totals.total,
    commission: restaurant.commission,
    vatPct: s.settings.vatPct,
    payment: { method: input.method, paidAt: now, reference: paymentReference(input.method) },
    customer: input.customer,
    note: input.note?.trim() || undefined,
    autopilot: s.settings.autopilot,
    notices: input.customer.email
      ? [{ at: now, channel: 'epost', text: `Kvitto för ${totals.total} kr skickat till ${input.customer.email}.` }]
      : [],
  };
  setState((prev) => ({
    ...prev,
    cart: null,
    orders: [order, ...prev.orders],
    customer: input.remember ? input.customer : null,
  }));
  return order;
}

function restaurantName(id: string): string {
  return state.restaurants.find((r) => r.id === id)?.name ?? 'Restaurangen';
}

function noticeFor(order: Order, status: OrderStatus, now: number): Notice | null {
  const name = restaurantName(order.restaurantId);
  const r = state.restaurants.find((x) => x.id === order.restaurantId);
  switch (status) {
    case 'accepted':
      return {
        at: now,
        channel: 'sms',
        text: `${name} har tagit emot din beställning ${order.number}. Klar ${when(order.confirmedTime ?? order.pickup.time, now)}.`,
      };
    case 'ready':
      return {
        at: now,
        channel: 'sms',
        text: `Din beställning ${order.number} är klar att hämta på ${r?.address ?? name}. Visa ordernumret i kassan.`,
      };
    case 'rejected':
      return {
        at: now,
        channel: 'sms',
        text: `${name} kunde inte ta emot beställning ${order.number}. Hela beloppet betalas tillbaka.`,
      };
    default:
      return null;
  }
}

interface TransitionOptions {
  confirmedTime?: number;
  reason?: string;
  /** Sätts när personalen själv agerar, så att demorestaurangen slutar svara automatiskt. */
  manual?: boolean;
}

function transition(order: Order, status: OrderStatus, now: number, options: TransitionOptions = {}): Order {
  const next: Order = {
    ...order,
    status,
    history: [...order.history, { status, at: now }],
    autopilot: options.manual ? false : order.autopilot,
  };
  if (status === 'accepted') next.confirmedTime = options.confirmedTime ?? order.pickup.time;
  if (status === 'rejected') next.rejectReason = options.reason;
  if (status === 'rejected' || status === 'cancelled') next.payment = { ...order.payment, refundedAt: now };
  if (order.origin === 'customer') {
    const notice = noticeFor(next, status, now);
    if (notice) next.notices = [...order.notices, notice];
  }
  return next;
}

function updateOrder(orderId: string, status: OrderStatus, options: TransitionOptions = {}) {
  const now = Date.now();
  setState((s) => ({
    ...s,
    orders: s.orders.map((o) => (o.id === orderId && o.status !== status ? transition(o, status, now, options) : o)),
  }));
}

export const acceptOrder = (id: string, confirmedTime: number) => updateOrder(id, 'accepted', { confirmedTime, manual: true });
export const startPreparing = (id: string) => updateOrder(id, 'preparing', { manual: true });
export const markReady = (id: string) => updateOrder(id, 'ready', { manual: true });
export const markPickedUp = (id: string) => updateOrder(id, 'picked_up', { manual: true });
export const rejectOrder = (id: string, reason: string) => updateOrder(id, 'rejected', { reason, manual: true });
export const cancelOrder = (id: string) => updateOrder(id, 'cancelled', { manual: true });

export function rateOrder(id: string, rating: number) {
  setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, rating } : o)) }));
}

/** Nästa steg i flödet, för knappen "Spola fram" i demoläget. */
export function nextStatus(order: Order): OrderStatus | null {
  switch (order.status) {
    case 'placed':
      return 'accepted';
    case 'accepted':
      return 'preparing';
    case 'preparing':
      return 'ready';
    case 'ready':
      return 'picked_up';
    default:
      return null;
  }
}

export function advanceDemo(id: string) {
  const order = state.orders.find((o) => o.id === id);
  const next = order && nextStatus(order);
  if (next) updateOrder(id, next);
}

// Demorestaurangens tempo, i sekunder från föregående steg.
const AUTOPILOT = { accept: 6, prepare: 8, ready: 25 };

/** Låter demorestaurangen svara på kundens beställningar i snabbt tempo. */
export function tickAutopilot(now: number) {
  if (!state.settings.autopilot) return;
  const due = (order: Order, seconds: number) => {
    const last = order.history[order.history.length - 1];
    return last ? now - last.at >= seconds * 1000 : false;
  };
  let changed = false;
  const orders = state.orders.map((o) => {
    if (o.origin !== 'customer' || !o.autopilot) return o;
    if (o.status === 'placed' && due(o, AUTOPILOT.accept)) {
      changed = true;
      return transition(o, 'accepted', now);
    }
    // Förbeställningar för en senare tid väntar tills tiden närmar sig.
    const startsSoon = o.pickup.mode === 'asap' || (o.confirmedTime ?? o.pickup.time) - now < 20 * 60_000;
    if (o.status === 'accepted' && startsSoon && due(o, AUTOPILOT.prepare)) {
      changed = true;
      return transition(o, 'preparing', now);
    }
    if (o.status === 'preparing' && due(o, AUTOPILOT.ready)) {
      changed = true;
      return transition(o, 'ready', now);
    }
    return o;
  });
  if (changed) setState((s) => ({ ...s, orders }));
}

// ---------------------------------------------------------------------------
// Restaurangens inställningar och meny
// ---------------------------------------------------------------------------

export function updateRestaurant(id: string, patch: Partial<Restaurant>) {
  setState((s) => ({ ...s, restaurants: s.restaurants.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
}

export function updateDish(restaurantId: string, dishId: string, patch: Partial<Dish>) {
  setState((s) => ({
    ...s,
    restaurants: s.restaurants.map((r) =>
      r.id === restaurantId ? { ...r, dishes: r.dishes.map((d) => (d.id === dishId ? { ...d, ...patch } : d)) } : r,
    ),
  }));
}

export function addDish(restaurantId: string, dish: Dish) {
  setState((s) => ({
    ...s,
    restaurants: s.restaurants.map((r) => (r.id === restaurantId ? { ...r, dishes: [...r.dishes, dish] } : r)),
  }));
}

export function removeDish(restaurantId: string, dishId: string) {
  setState((s) => ({
    ...s,
    restaurants: s.restaurants.map((r) =>
      r.id === restaurantId ? { ...r, dishes: r.dishes.filter((d) => d.id !== dishId) } : r,
    ),
    cart: s.cart
      ? { ...s.cart, lines: s.cart.lines.filter((l) => !(s.cart?.restaurantId === restaurantId && l.dishId === dishId)) }
      : null,
  }));
}

export function addCategory(restaurantId: string, name: string): string {
  const id = `${name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-')}-${Date.now().toString(36)}`;
  setState((s) => ({
    ...s,
    restaurants: s.restaurants.map((r) => (r.id === restaurantId ? { ...r, menu: [...r.menu, { id, name }] } : r)),
  }));
  return id;
}

export function updateSettings(patch: Partial<PlatformSettings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function resetDemo() {
  remove(STORAGE_KEY);
  state = initialState(Date.now());
  persist();
  emit();
}

/** Text för en pausad restaurang, t.ex. "Pausad till 18:45". */
export function pausedLabel(r: Restaurant, now: number): string | null {
  return r.pausedUntil && r.pausedUntil > now ? `Pausad till ${clock(r.pausedUntil)}` : null;
}
