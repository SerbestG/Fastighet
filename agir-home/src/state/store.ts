import { useSyncExternalStore } from 'react';
import { createAdapter } from '../devices';
import type { AlarmMode, DeviceKind, DeviceState, DeviceStates } from '../devices/types';
import { defaultState, PLACEMENTS, roomById, type FloorId, type Placement } from '../home/model';
import { ALARM_MODES, HOME_SCENES, LIGHT_SCENES, type Scene } from '../home/scenes';

export type EventCat = 'sak' | 'klim' | 'energi' | 'agir';
export interface HomeEvent {
  id: string;
  at: number;
  cat: EventCat;
  title: string;
  sub: string;
  byAgir?: boolean;
  action?: { label: string; done: string; run: string };
  done?: boolean;
}

export interface Automation { id: string; name: string; sub: string; on: boolean }

export interface Member { id: string; name: string; initial: string; role: string; color: string; desc: string }
export type PermKey = 'ljus' | 'varme' | 'las' | 'larm' | 'kamera' | 'ladd';

export interface AppState {
  ready: boolean;
  online: boolean;
  source: string;
  devices: DeviceStates;
  alarm: AlarmMode;
  outdoor: number;
  price: number;
  scene: string | null;
  lightScene: string | null;
  extra: Placement[];
  events: HomeEvent[];
  automations: Automation[];
  members: Member[];
  perms: Record<string, Record<PermKey, boolean>>;
  onboarded: boolean;
  wake: string;
  comfort: number;
  dismissed: string[];
  notify: Record<string, boolean>;
  update: 'ny' | 'natt' | 'klar';
  /** Visningsläge för 3D-huset – delas av alla skärmar. */
  view: { floor: FloorId; mode: '2d' | '3d'; rz: number; rx: number; zoom: number };
}

const APP_KEY = 'agir.app.v1';
const today = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); };

const SEED_EVENTS: HomeEvent[] = [
  { id: 'bud', at: today(21, 38), cat: 'sak', title: 'Bud vid porten', sub: 'Kameran ser ett paket. Öppna porten?', action: { label: 'Öppna porten', done: 'Porten öppnad', run: 'port' } },
  { id: 'las', at: today(21, 12), cat: 'sak', title: 'Ytterdörren låstes', sub: 'Agir låste två minuter efter att alla var inne.', byAgir: true },
  { id: 'fon', at: today(21, 5), cat: 'klim', title: 'Värmen pausad i barnrummet', sub: 'Fönstret öppnades. Agir startar värmen när det stängs.', byAgir: true },
  { id: 'ai', at: today(19, 5), cat: 'agir', title: 'Förslag: senare godnatt på fredagar', sub: 'Ni har tänt i barnrummet efter 22 tre fredagar i rad.', action: { label: 'Ändra till 22:30', done: 'Ändrat', run: 'fredag' } },
  { id: 'hem', at: today(17, 46), cat: 'sak', title: 'Sambo kom hem', sub: 'Hallen tändes och borta-läget stängdes av.', byAgir: true },
  { id: 'sol', at: today(15, 42), cat: 'klim', title: 'Scenen Kväll startade', sub: 'Solen gick ner.', byAgir: true },
  { id: 'el', at: today(5, 10), cat: 'energi', title: 'Bilen laddad till 80 %', sub: '14 kr i stället för 41 kr.', byAgir: true },
  { id: 'golv', at: today(2, 0), cat: 'energi', title: 'Badrumsgolvet förvärmdes', sub: 'Elen kostade 18 öre. Sparade 9 kr.', byAgir: true },
];

const DEFAULT: AppState = {
  ready: false, online: true, source: '', devices: {}, alarm: 'off', outdoor: -3, price: 0.42,
  scene: 'hemma', lightScene: 'dag', extra: [], events: SEED_EVENTS,
  automations: [
    { id: 'a1', name: 'Godnatt', sub: '23:00 · släck, lås, larm hemma, 19° i sovrummet', on: true },
    { id: 'a2', name: 'Sista personen går', sub: 'Borta-läge, lås, larm på, 17°', on: true },
    { id: 'a3', name: 'Billig el', sub: 'Under 50 öre · värm golv, ladda bilen, kör tvätten', on: true },
    { id: 'a4', name: 'Läcka upptäckt', sub: 'Stäng vattnet och larma alla vuxna', on: true },
    { id: 'a5', name: 'Solnedgång', sub: 'Starta scenen Kväll', on: true },
  ],
  members: [
    { id: 'du', name: 'Du', initial: 'D', role: 'Ägare', color: '#D4B483', desc: 'Ägare · kan ändra allt och bjuda in' },
    { id: 'sambo', name: 'Sambo', initial: 'S', role: 'Vuxen', color: '#2CC56F', desc: 'Vuxen · samma som du, utom att ta bort hemmet' },
    { id: 'barn', name: 'Barn', initial: 'B', role: 'Barn', color: '#F0A030', desc: 'Barn · styr sitt eget rum från telefon eller klocka' },
    { id: 'gast', name: 'Mormor', initial: 'M', role: 't.o.m. sön', color: '#8E6FD8', desc: 'Gäst · tillgång till och med söndag 23:59' },
  ],
  perms: {
    du: { ljus: true, varme: true, las: true, larm: true, kamera: true, ladd: true },
    sambo: { ljus: true, varme: true, las: true, larm: true, kamera: true, ladd: true },
    barn: { ljus: true, varme: true, las: false, larm: false, kamera: false, ladd: false },
    gast: { ljus: true, varme: true, las: true, larm: false, kamera: false, ladd: false },
  },
  onboarded: false, wake: '06:30', comfort: 22, dismissed: [],
  notify: { lacka: true, las: true, larm: true, agir: true, pris: false },
  update: 'ny',
  view: { floor: 'e', mode: '3d', rz: -38, rx: 56, zoom: 0.8 },
};

const PERSISTED: (keyof AppState)[] = ['scene', 'lightScene', 'extra', 'events', 'automations', 'members', 'perms', 'onboarded', 'wake', 'comfort', 'dismissed', 'notify', 'update', 'view'];

function loadApp(): AppState {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw), ready: false, devices: {} };
  } catch { /* börja om */ }
  return DEFAULT;
}

let state: AppState = loadApp();
const subs = new Set<() => void>();
let saveTimer: number | undefined;

function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((f) => f());
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(APP_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, state[k]])))); } catch { /* ignoreras */ }
  }, 250);
}

export const getState = () => state;
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

/* ---------- enhetskälla ---------- */

const adapter = createAdapter();

export async function boot() {
  adapter.subscribe((e) => {
    if (e.type === 'device') set((s) => ({ devices: { ...s.devices, [e.id]: e.state } }));
    else if (e.type === 'alarm') set({ alarm: e.mode });
    else if (e.type === 'connection') set({ online: e.online });
  });
  try {
    const snap = await adapter.connect();
    set({ ready: true, source: adapter.label, devices: snap.devices, alarm: snap.alarm, outdoor: snap.outdoor ?? state.outdoor, price: snap.pricePerKwh ?? state.price });
  } catch {
    set({ ready: true, online: false, source: adapter.label });
  }
}

/* ---------- placeringar ---------- */

export const allPlacements = (s: AppState = state) => [...PLACEMENTS, ...s.extra];
export const placement = (id: string, s: AppState = state) => allPlacements(s).find((p) => p.id === id);

/* ---------- åtgärder ---------- */

function optimistic(patches: Record<string, Partial<DeviceState>>) {
  set((s) => {
    const devices = { ...s.devices };
    for (const [id, p] of Object.entries(patches)) if (devices[id]) devices[id] = { ...devices[id], ...p, changedAt: Date.now() };
    return { devices };
  });
}

let autoLock: number | undefined;

export function setDevice(id: string, patch: Partial<DeviceState>) {
  optimistic({ [id]: patch });
  void adapter.setDevice(id, patch);
  const p = placement(id);
  if (p?.kind === 'lock' && patch.on !== undefined) {
    logEvent('sak', patch.on ? 'Ytterdörren låstes' : 'Ytterdörren låstes upp', 'Från appen.');
    window.clearTimeout(autoLock);
    // Agir låser igen efter två minuter, som appen lovar.
    if (!patch.on) autoLock = window.setTimeout(() => {
      if (state.devices[id] && !state.devices[id].on) {
        optimistic({ [id]: { on: true } });
        void adapter.setDevice(id, { on: true });
        logEvent('sak', 'Ytterdörren låstes', 'Agir låste två minuter efter att den låstes upp.', true);
      }
    }, 120000);
  }
  if (p?.kind === 'leak' && patch.on === false) logEvent('sak', 'Vattnet stängdes av', `${roomById(p.room)?.name} · från appen.`);
}

export function setMany(patches: Record<string, Partial<DeviceState>>) {
  optimistic(patches);
  void adapter.setMany(patches);
}

export function applyScene(sc: Scene, kind: 'home' | 'light' = 'home') {
  setMany(sc.patches);
  if (sc.alarm) setAlarm(sc.alarm, false);
  if (kind === 'home') set({ scene: sc.id });
  else set({ lightScene: sc.id });
  logEvent('agir', `Scenen ${sc.label} startade`, 'Från appen.');
}

export function sceneById(id: string) {
  return [...HOME_SCENES, ...LIGHT_SCENES].find((s) => s.id === id);
}

export function setAlarm(mode: AlarmMode, log = true) {
  set({ alarm: mode });
  void adapter.setAlarm(mode);
  if (log) logEvent('sak', ALARM_MODES.find((m) => m.id === mode)!.label, mode === 'off' ? 'Larmet stängdes av.' : 'Larmet slogs på.');
}

export function addDevice(kind: DeviceKind, room: string, name: string) {
  const rm = roomById(room)!;
  const n = state.extra.length;
  const id = `x${Date.now().toString(36)}`;
  const pl: Placement = {
    id, kind, room, floor: rm.floor, name,
    x: Math.round(rm.x + rm.w * (0.3 + 0.4 * ((n * 0.37) % 1))),
    y: Math.round(rm.y + rm.h * 0.4),
  };
  const st = defaultState(kind);
  set((s) => ({ extra: [...s.extra, pl], devices: { ...s.devices, [id]: st } }));
  void adapter.addDevice(id, st);
  logEvent('agir', `${name} tillagd`, `${rm.name} · Matter över Thread.`);
  return pl;
}

export function logEvent(cat: EventCat, title: string, sub: string, byAgir = false) {
  set((s) => ({ events: [{ id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: Date.now(), cat, title, sub, byAgir }, ...s.events].slice(0, 80) }));
}

export function markEventDone(id: string) {
  set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, done: true } : e)) }));
}

export const setView = (v: Partial<AppState['view']>) => set((s) => ({ view: { ...s.view, ...v } }));
export const dismiss = (id: string) => set((s) => ({ dismissed: [...s.dismissed, id] }));
export const patchApp = (p: Partial<AppState>) => set(p);

export function toggleAutomation(id: string) {
  set((s) => ({ automations: s.automations.map((a) => (a.id === id ? { ...a, on: !a.on } : a)) }));
}
export function addAutomation(name: string, sub: string) {
  set((s) => ({ automations: [{ id: `a${Date.now().toString(36)}`, name, sub, on: true }, ...s.automations] }));
}
export function togglePerm(member: string, key: PermKey) {
  set((s) => ({ perms: { ...s.perms, [member]: { ...s.perms[member], [key]: !s.perms[member][key] } } }));
}

export function resetDemo() {
  try { localStorage.removeItem(APP_KEY); localStorage.removeItem('agir.mock.v1'); } catch { /* ignoreras */ }
  location.href = '/';
}
