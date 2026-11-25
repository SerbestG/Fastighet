import type { DeviceAdapter } from './types';
import { MockAdapter } from './mockAdapter';
import { HomeAssistantAdapter } from './homeAssistantAdapter';

/**
 * Väljer enhetskälla. Byt här (eller med miljövariabler i Vercel) – inget i UI:t ändras.
 *   mock → låtsasenheter (standard)
 *   ha   → Home Assistant
 *   hub  → Agir Hub (Matter/Thread) – kommer: samma gränssnitt, egen adapter
 */
export function createAdapter(): DeviceAdapter {
  const source = import.meta.env.VITE_DEVICE_SOURCE ?? 'mock';
  const url = import.meta.env.VITE_HA_URL as string | undefined;
  const token = import.meta.env.VITE_HA_TOKEN as string | undefined;
  if (source === 'ha' && url && token) return new HomeAssistantAdapter(url.replace(/\/$/, ''), token);
  return new MockAdapter();
}

export type * from './types';
