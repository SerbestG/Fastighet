import type { DeviceStates } from '../devices/types';
import { ROOMS, type Placement } from '../home/model';
import type { AppState } from './store';
import { allPlacements } from './store';

export const fmtNum = (v: number, d = 1) => (Number.isInteger(v) && d === 1 ? String(v) : v.toFixed(d)).replace('.', ',').replace('-', '−');
export const fmtTemp = (v: number) => fmtNum(Math.round(v * 10) / 10) + '°';
export const fmtKw = (v: number) => fmtNum(Math.round(v * 10) / 10) + ' kW';
export const clock = (t: number) => new Date(t).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

/** Timpris (kr/kWh) för ett typiskt novemberdygn i SE3. */
export const PRICE_CURVE = [0.24, 0.2, 0.18, 0.18, 0.19, 0.26, 0.58, 1.12, 1.34, 0.96, 0.71, 0.62, 0.55, 0.52, 0.58, 0.74, 1.18, 1.62, 1.84, 1.41, 0.98, 0.72, 0.51, 0.33];
export const priceNow = () => PRICE_CURVE[new Date().getHours()];

export function lightsOn(s: AppState) {
  return allPlacements(s).filter((p) => p.kind === 'light' && s.devices[p.id]?.on);
}

export function openWindows(s: AppState) {
  return allPlacements(s).filter((p) => p.kind === 'window' && s.devices[p.id] && !s.devices[p.id].on);
}

export function indoorTemp(s: AppState) {
  const r = allPlacements(s).filter((p) => p.kind === 'heat').map((p) => s.devices[p.id]?.reading).filter((x): x is number => typeof x === 'number');
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 21.8;
}

/** Effekt i kW för en enhet just nu. */
export function devicePower(p: Placement, d: DeviceStates): number {
  const s = d[p.id];
  if (!s) return 0;
  switch (p.kind) {
    case 'light': return s.on ? 0.04 * (s.value / 100) + 0.004 : 0;
    case 'heat': {
      if (!s.on || s.mode === 'off') return 0;
      const heating = (s.reading ?? s.value) < s.value + 0.2;
      return heating ? (s.mode === 'eco' ? 0.22 : 0.42) : 0.06;
    }
    case 'media': return s.on ? 0.03 : 0.002;
    case 'charger': {
      if (!s.on) return 0;
      const h = new Date().getHours();
      if (s.mode === 'now') return 7.4;
      if (s.mode === 'smart' && h >= 2 && h < 5) return 7.4;
      return 0;
    }
    case 'camera': return 0.005;
    default: return 0;
  }
}

export function roomPower(s: AppState, roomId: string) {
  const rm = ROOMS.find((r) => r.id === roomId);
  return (rm?.base ?? 0) + allPlacements(s).filter((p) => p.room === roomId).reduce((a, p) => a + devicePower(p, s.devices), 0);
}

export function totalPower(s: AppState) {
  return ROOMS.reduce((a, r) => a + roomPower(s, r.id), 0);
}

/** Uppskattad förbrukning hittills idag (kWh) – grovt men levande. */
export function kwhToday(s: AppState) {
  const now = new Date();
  const hours = now.getHours() + now.getMinutes() / 60;
  return 0.65 * hours + totalPower(s) * 0.25;
}

export const heatColor = (t: number) => (t >= 23.5 ? '226,96,52' : t >= 21.5 ? '240,146,80' : t >= 20.5 ? '242,190,120' : '110,150,210');
