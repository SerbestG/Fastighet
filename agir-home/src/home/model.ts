import type { DeviceKind, DeviceState, DeviceStates } from '../devices/types';

/** Ritningens koordinater: varje våning är 350 × 380 punkter. */
export const PLAN_W = 350;
export const PLAN_H = 380;

export type FloorId = 'e' | 'o';

export interface Room {
  id: string;
  name: string;
  floor: FloorId;
  x: number;
  y: number;
  w: number;
  h: number;
  area: string;
  /** Bestämd form: "i köket", "i barnrummet". */
  def: string;
  /** Grundlast i kW som inte kommer från styrda enheter (vitvaror m.m.). */
  base: number;
}

export interface Placement {
  id: string;
  kind: DeviceKind;
  room: string;
  floor: FloorId;
  x: number;
  y: number;
  name: string;
  /** Plugg: 'dim' eller 'onoff'. Knapp: 'rotary' eller 'push'. */
  variant?: string;
  /** Produkt i Agir-sortimentet, t.ex. "Agir Dosdimmer D1". */
  product?: string;
}

/** Enheter som ger ljus och därför får rummet att glöda. */
export const isLightLike = (p: Pick<Placement, 'kind' | 'variant'>) =>
  p.kind === 'light' || p.kind === 'strip' || (p.kind === 'plug' && p.variant === 'dim');

/** Enheter som har en dimbar nivå och ljusfärg. */
export const isDimmable = isLightLike;

export const FLOORS: { id: FloorId; label: string }[] = [
  { id: 'e', label: 'Entréplan' },
  { id: 'o', label: 'Övre plan' },
];

const r = (floor: FloorId, id: string, name: string, x: number, y: number, w: number, h: number, area: string, base: number, def: string): Room =>
  ({ id, name, floor, x, y, w, h, area, base, def });

export const ROOMS: Room[] = [
  r('e', 'vard', 'Vardagsrum', 0, 0, 200, 170, '34 m²', 0.12, 'vardagsrummet'),
  r('e', 'kok', 'Kök', 200, 0, 150, 120, '18 m²', 0.9, 'köket'),
  r('e', 'mat', 'Matplats', 200, 120, 150, 100, '14 m²', 0.02, 'matplatsen'),
  r('e', 'hall', 'Hall', 0, 170, 110, 90, '9 m²', 0.02, 'hallen'),
  r('e', 'wc', 'WC', 110, 170, 90, 90, '4 m²', 0.05, 'toaletten'),
  r('e', 'arb', 'Arbetsrum', 0, 260, 200, 120, '15 m²', 0.18, 'arbetsrummet'),
  r('e', 'tvatt', 'Tvätt', 200, 220, 150, 80, '7 m²', 0.6, 'tvättstugan'),
  r('e', 'entre', 'Entré', 200, 300, 150, 80, '8 m²', 0.03, 'entrén'),
  r('o', 'sov', 'Sovrum', 0, 0, 200, 180, '22 m²', 0.03, 'sovrummet'),
  r('o', 'bad', 'Badrum', 200, 0, 150, 110, '11 m²', 0.1, 'badrummet'),
  r('o', 'klad', 'Klädkammare', 200, 110, 150, 70, '6 m²', 0.01, 'klädkammaren'),
  r('o', 'barn', 'Barnrum', 0, 180, 170, 200, '14 m²', 0.08, 'barnrummet'),
  r('o', 'all', 'Allrum', 170, 180, 180, 200, '24 m²', 0.15, 'allrummet'),
];

export const WINDOWS: Record<FloorId, [number, number, number, number][]> = {
  e: [[10, -2, 120, 3], [210, -2, 120, 3], [-2, 20, 3, 120], [349, 140, 3, 60], [-2, 280, 3, 80], [30, 379, 140, 3]],
  o: [[20, -2, 150, 3], [230, -2, 90, 3], [-2, 200, 3, 140], [349, 220, 3, 120], [190, 379, 140, 3]],
};

const p = (id: string, kind: DeviceKind, room: string, x: number, y: number, name: string, product?: string, variant?: string): Placement => {
  const floor = ROOMS.find((rm) => rm.id === room)!.floor;
  return { id, kind, room, floor, x, y, name, product, variant };
};

export const PLACEMENTS: Placement[] = [
  p('l1', 'light', 'vard', 100, 60, 'Taklampa'),
  p('l2', 'light', 'kok', 270, 45, 'Bänkbelysning'),
  p('l3', 'light', 'mat', 280, 170, 'Pendlar'),
  p('l4', 'light', 'hall', 55, 215, 'Spotlights'),
  p('h1', 'heat', 'vard', 40, 130, 'Golvvärme'),
  p('h2', 'heat', 'kok', 325, 95, 'Golvvärme'),
  p('h3', 'heat', 'arb', 160, 345, 'Golvvärme'),
  p('b1', 'blind', 'vard', 160, 25, 'Persienner'),
  p('k1', 'lock', 'entre', 270, 360, 'Ytterdörren'),
  p('c1', 'camera', 'entre', 325, 320, 'Entrékamera'),
  p('s1', 'leak', 'tvatt', 270, 260, 'Läckagevakt'),
  p('m1', 'media', 'vard', 165, 140, 'Högtalare'),
  p('e1', 'charger', 'entre', 225, 330, 'Laddbox'),
  p('w1', 'window', 'arb', 30, 300, 'Fönster'),
  p('l5', 'light', 'sov', 100, 80, 'Taklampa'),
  p('l6', 'light', 'bad', 270, 45, 'Spotlights'),
  p('l7', 'light', 'barn', 85, 270, 'Taklampa'),
  p('l8', 'light', 'all', 260, 250, 'Taklampa'),
  p('h4', 'heat', 'sov', 40, 150, 'Golvvärme'),
  p('h5', 'heat', 'bad', 325, 85, 'Golvvärme'),
  p('h6', 'heat', 'barn', 135, 350, 'Golvvärme'),
  p('b2', 'blind', 'sov', 160, 25, 'Mörkläggning'),
  p('s2', 'leak', 'bad', 225, 85, 'Läckagevakt'),
  p('w2', 'window', 'barn', 25, 215, 'Fönster'),
  p('m2', 'media', 'all', 320, 330, 'Högtalare'),
  // Hela ljussortimentet: LED-list, relä, pluggar, rörelsevakter och knappar.
  p('st1', 'strip', 'kok', 230, 95, 'LED-list', 'Agir LED-driver L75'),
  p('p2', 'plug', 'kok', 320, 30, 'Kaffebryggare', 'Agir Plugg P1', 'onoff'),
  p('p1', 'plug', 'vard', 40, 40, 'Golvlampa', 'Agir Plugg P2 dimmer', 'dim'),
  p('r1', 'relay', 'wc', 175, 200, 'Fläkt', 'Agir Relä R1'),
  p('mo1', 'motion', 'hall', 25, 190, 'Rörelsevakt', 'Agir Rörelsevakt M1'),
  p('r2', 'relay', 'entre', 325, 362, 'Utebelysning', 'Agir Relä R1'),
  p('bt2', 'button', 'entre', 268, 318, 'Knapp vid dörren', 'Agir Knapp K1', 'push'),
  p('st2', 'strip', 'sov', 60, 30, 'LED-list säng', 'Agir LED-driver L10'),
  p('bt1', 'button', 'sov', 160, 150, 'Vridknapp', 'Agir Vrid V1', 'rotary'),
  p('mo2', 'motion', 'bad', 320, 30, 'Närvarosensor', 'Agir Rörelsevakt M1'),
];

const S = (on: boolean, value: number, extra: Partial<DeviceState> = {}): DeviceState => ({ on, value, ...extra });

/** Utgångsläget för demohemmet – samma som i skisserna. */
export const INITIAL_STATES: DeviceStates = {
  l1: S(true, 70, { tone: 'warm' }), l2: S(true, 100, { tone: 'neutral' }), l3: S(false, 60, { tone: 'warm' }), l4: S(true, 40, { tone: 'warm' }),
  l5: S(false, 30, { tone: 'warm' }), l6: S(true, 60, { tone: 'cool' }), l7: S(false, 50, { tone: 'warm' }), l8: S(true, 80, { tone: 'neutral' }),
  h1: S(true, 22, { mode: 'comfort', reading: 21.8 }), h2: S(true, 22, { mode: 'comfort', reading: 21.6 }), h3: S(true, 19.5, { mode: 'eco', reading: 19.9 }),
  h4: S(true, 19.5, { mode: 'eco', reading: 19.7 }), h5: S(true, 24, { mode: 'comfort', reading: 23.4 }), h6: S(true, 21, { mode: 'comfort', reading: 20.8 }),
  b1: S(true, 100), b2: S(true, 0),
  k1: S(true, 0), c1: S(true, 0), s1: S(true, 0, { battery: 92 }), s2: S(true, 0, { battery: 88 }),
  m1: S(true, 35), m2: S(false, 25),
  e1: S(true, 80, { mode: 'smart' }),
  w1: S(true, 0), w2: S(false, 0),
  st1: S(true, 60, { tone: 'auto' }), st2: S(false, 30, { tone: 'warm' }),
  p1: S(true, 45, { tone: 'warm' }), p2: S(false, 0, { power: 1.1 }),
  r1: S(false, 0), r2: S(true, 0),
  mo1: S(true, 2, { lux: 14, battery: 96 }), mo2: S(true, 5, { lux: 40, battery: 81 }),
  bt1: S(true, 0, { mode: 'toggle', battery: 100 }), bt2: S(true, 0, { mode: 'allt-av', battery: 74 }),
};

/** Standardläge för en ny enhet av ett visst slag. */
export function defaultState(kind: DeviceKind): DeviceState {
  switch (kind) {
    case 'light': return S(true, 70, { tone: 'warm' });
    case 'heat': return S(true, 21, { mode: 'comfort', reading: 20.5 });
    case 'blind': return S(true, 100);
    case 'media': return S(false, 25);
    case 'charger': return S(false, 80, { mode: 'smart' });
    case 'leak': return S(true, 0, { battery: 100 });
    case 'strip': return S(true, 60, { tone: 'auto' });
    case 'plug': return S(false, 50, { tone: 'warm', power: 0.06 });
    case 'relay': return S(false, 0);
    case 'motion': return S(true, 2, { lux: 20, battery: 100 });
    case 'button': return S(true, 0, { mode: 'toggle', battery: 100 });
    default: return S(true, 0);
  }
}

export const roomById = (id: string) => ROOMS.find((rm) => rm.id === id);
export const roomsOn = (floor: FloorId) => ROOMS.filter((rm) => rm.floor === floor);

export const KIND_LABEL: Record<DeviceKind, string> = {
  light: 'Ljus', heat: 'Golvvärme', lock: 'Lås', blind: 'Persienn', camera: 'Kamera',
  leak: 'Läckagevakt', window: 'Fönster', media: 'Högtalare', charger: 'Laddbox',
  strip: 'LED-list', relay: 'Relä', plug: 'Smart plugg', motion: 'Rörelsevakt', button: 'Knapp',
};

/** Batteridrivna enheter (resten är nätanslutna och förstärker Thread-nätet). */
export const BATTERY_KINDS: DeviceKind[] = ['leak', 'window', 'motion', 'button'];
