import { useSyncExternalStore } from 'react';
import { createAdapter } from '../devices';
import type { AlarmMode, ButtonAction, DeviceKind, DeviceState, DeviceStates } from '../devices/types';
import { defaultState, isLightLike, PLACEMENTS, roomById, type FloorId, type Placement } from '../home/model';
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
  /** Egna scener som användaren sparat. */
  customScenes: Scene[];
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
  customScenes: [],
  view: { floor: 'e', mode: '3d', rz: -38, rx: 56, zoom: 0.8 },
};

const PERSISTED: (keyof AppState)[] = ['scene', 'lightScene', 'extra', 'events', 'automations', 'members', 'perms', 'onboarded', 'wake', 'comfort', 'dismissed', 'notify', 'update', 'view', 'customScenes'];

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

const adapter = createAdapter((id) => placement(id)?.kind);

export async function boot() {
  adapter.subscribe((e) => {
    if (e.type === 'device') {
      const before = state.devices[e.id];
      set((s) => ({ devices: { ...s.devices, [e.id]: e.state } }));
      if (e.state.lastMotion && e.state.lastMotion !== before?.lastMotion) onMotion(e.id);
    }
    else if (e.type === 'alarm') set({ alarm: e.mode });
    else if (e.type === 'connection') set({ online: e.online });
  });
  try {
    const snap = await adapter.connect();
    set({ ready: true, source: adapter.label, devices: snap.devices, alarm: snap.alarm, outdoor: snap.outdoor ?? state.outdoor, price: snap.pricePerKwh ?? state.price });
    // Timrar som löpte medan appen var stängd.
    for (const [id, d] of Object.entries(snap.devices)) if (d.on && d.timerUntil) scheduleOff(id, d.timerUntil);
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
const offTimers = new Map<string, number>();

/** Stänger av en enhet vid en viss tidpunkt (timer på relä, plugg och lampor). */
function scheduleOff(id: string, at: number) {
  window.clearTimeout(offTimers.get(id));
  const run = () => {
    offTimers.delete(id);
    const d = state.devices[id];
    if (!d || !d.on || d.timerUntil !== at) return;
    optimistic({ [id]: { on: false, timerUntil: undefined } });
    void adapter.setDevice(id, { on: false, timerUntil: undefined });
    const p = placement(id);
    if (p) logEvent('energi', `${p.name} stängdes av`, 'Timern gick ut.', true);
  };
  const ms = at - Date.now();
  if (ms <= 0) run(); else offTimers.set(id, window.setTimeout(run, Math.min(ms, 2 ** 31 - 1)));
}

/* Rörelsevakten: tänder rummet när någon kommer in och det är mörkt, släcker när det blivit tomt. */
const motionOff = new Map<string, number>();
const motionLit = new Map<string, string[]>();
function onMotion(id: string) {
  const p = placement(id);
  const d = state.devices[id];
  if (!p || p.kind !== 'motion' || !d?.on) return;
  const hour = new Date().getHours();
  const dark = hour >= 16 || hour < 8 || (d.lux ?? 100) < 20;
  const lamps = allPlacements().filter((x) => x.room === p.room && isLightLike(x));
  const allOff = lamps.every((l) => !state.devices[l.id]?.on);
  const night = hour >= 23 || hour < 6;
  if (allOff && dark && lamps.length) {
    const level = night ? 8 : 70;
    setMany(Object.fromEntries(lamps.map((l) => [l.id, { on: true, value: level }])));
    motionLit.set(p.room, lamps.map((l) => l.id));
    logEvent('agir', `${roomById(p.room)?.name} tändes`, night ? 'Rörelse i natt · svagt nattljus.' : 'Rörelse och mörkt.', true);
  }
  // Släck bara det Agir själv tände, efter vald tid utan rörelse.
  const lit = motionLit.get(p.room);
  if (!lit) return;
  window.clearTimeout(motionOff.get(p.room));
  motionOff.set(p.room, window.setTimeout(() => {
    setMany(Object.fromEntries(lit.map((l) => [l, { on: false }])));
    motionLit.delete(p.room);
  }, Math.max(1, d.value) * 60000));
}

const ACTION_LABEL: Record<ButtonAction, string> = { toggle: 'Tänd/släck rummet', natt: 'Godnatt', 'allt-av': 'Allt av', film: 'Film' };
export const BUTTON_ACTIONS = (Object.keys(ACTION_LABEL) as ButtonAction[]).map((id) => ({ id, label: ACTION_LABEL[id] }));

/** Vad som händer när någon trycker på en trådlös knapp. */
export function pressButton(id: string) {
  const p = placement(id);
  const d = state.devices[id];
  if (!p || !d) return;
  const mode = (d.mode as ButtonAction) ?? 'toggle';
  if (mode === 'toggle') {
    const lamps = allPlacements().filter((x) => x.room === p.room && isLightLike(x));
    const on = lamps.some((l) => state.devices[l.id]?.on);
    setMany(Object.fromEntries(lamps.map((l) => [l.id, { on: !on, value: state.devices[l.id]?.value || 70 }])));
  } else if (mode === 'allt-av') {
    setMany(Object.fromEntries(allPlacements().filter((x) => isLightLike(x) && state.devices[x.id]?.on).map((x) => [x.id, { on: false }])));
  } else {
    const sc = sceneById(mode);
    if (sc) applyScene(sc);
  }
  logEvent('agir', `${p.name}: ${ACTION_LABEL[mode]}`, `${roomById(p.room)?.name} · tryck.`);
}

export function setDevice(id: string, patch: Partial<DeviceState>) {
  // Släcks enheten tas timern bort; sätts en ny timer schemaläggs den.
  if (patch.on === false && state.devices[id]?.timerUntil) patch = { ...patch, timerUntil: undefined };
  optimistic({ [id]: patch });
  void adapter.setDevice(id, patch);
  if (patch.timerUntil) scheduleOff(id, patch.timerUntil);
  else if (patch.on === false) window.clearTimeout(offTimers.get(id));
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
  return [...HOME_SCENES, ...LIGHT_SCENES, ...state.customScenes].find((s) => s.id === id);
}

export function setAlarm(mode: AlarmMode, log = true) {
  set({ alarm: mode });
  void adapter.setAlarm(mode);
  if (log) logEvent('sak', ALARM_MODES.find((m) => m.id === mode)!.label, mode === 'off' ? 'Larmet stängdes av.' : 'Larmet slogs på.');
}

export function addDevice(kind: DeviceKind, room: string, name: string, product?: string, variant?: string) {
  const rm = roomById(room)!;
  const n = state.extra.length;
  const id = `x${Date.now().toString(36)}`;
  const pl: Placement = {
    id, kind, room, floor: rm.floor, name, product, variant,
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

/* ---------- egna scener ---------- */

/** Sparar hur de valda enheterna står just nu som en scen. */
export function saveScene(label: string, ids: string[], dot: string) {
  const patches: Scene['patches'] = {};
  for (const id of ids) {
    const d = state.devices[id];
    if (!d) continue;
    patches[id] = d.on ? { on: true, value: d.value, ...(d.tone ? { tone: d.tone } : {}) } : { on: false };
  }
  const sc: Scene = { id: `s${Date.now().toString(36)}`, label, dot, patches, say: `Scenen ${label} är på.` };
  set((s) => ({ customScenes: [...s.customScenes, sc], scene: sc.id }));
  logEvent('agir', `Ny scen: ${label}`, `${ids.length} enheter.`);
  return sc;
}

export function deleteScene(id: string) {
  set((s) => ({ customScenes: s.customScenes.filter((x) => x.id !== id), scene: s.scene === id ? null : s.scene, lightScene: s.lightScene === id ? null : s.lightScene }));
}
