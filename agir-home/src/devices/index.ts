import type { DeviceAdapter, DeviceKind } from './types';
import { MockAdapter } from './mockAdapter';
import { HomeAssistantAdapter } from './homeAssistantAdapter';
import { HybridAdapter } from './hybridAdapter';

/** Inställningar från "Anslut Home Assistant" i appen. Sparas bara i den här telefonen. */
export interface HAConfig { url: string; token: string; map: Record<string, string> }
const HA_KEY = 'agir.ha.v1';

export function loadHAConfig(): HAConfig | null {
  try { const raw = localStorage.getItem(HA_KEY); return raw ? (JSON.parse(raw) as HAConfig) : null; } catch { return null; }
}
export function saveHAConfig(c: HAConfig | null) {
  try { if (c) localStorage.setItem(HA_KEY, JSON.stringify(c)); else localStorage.removeItem(HA_KEY); } catch { /* ignoreras */ }
}

/**
 * Väljer enhetskälla – inget i UI:t ändras.
 *   Kopplat i appen → Home Assistant för kopplade enheter, demo för resten
 *   VITE_DEVICE_SOURCE=ha → bara Home Assistant (miljövariabler i Vercel)
 *   annars → låtsasenheter
 *   Agir Hub (Matter/Thread) kommer som en egen adapter med samma gränssnitt.
 */
export function createAdapter(kindOf: (id: string) => DeviceKind | undefined): DeviceAdapter {
  const cfg = loadHAConfig();
  if (cfg?.url && cfg.token && Object.keys(cfg.map).length) {
    const real = new HomeAssistantAdapter(cfg.url.replace(/\/$/, ''), cfg.token, cfg.map, kindOf);
    return new HybridAdapter(real, new MockAdapter(), (id) => id in cfg.map, 'alarm' in cfg.map);
  }
  const source = import.meta.env.VITE_DEVICE_SOURCE ?? 'mock';
  const url = import.meta.env.VITE_HA_URL as string | undefined;
  const token = import.meta.env.VITE_HA_TOKEN as string | undefined;
  if (source === 'ha' && url && token) return new HomeAssistantAdapter(url.replace(/\/$/, ''), token, undefined, kindOf);
  return new MockAdapter();
}

export type * from './types';
