import type { AdapterEvent, AlarmMode, DeviceAdapter, DeviceState, DeviceStates, Snapshot } from './types';
import { INITIAL_STATES } from '../home/model';

const KEY = 'agir.mock.v1';

interface Saved { devices: DeviceStates; alarm: AlarmMode }

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      // Nya enheter i demohemmet läggs till utan att användarens ändringar försvinner.
      return { alarm: s.alarm ?? 'off', devices: { ...structuredClone(INITIAL_STATES), ...s.devices } };
    }
  } catch { /* privat läge eller trasig data – börja om */ }
  return { alarm: 'off', devices: structuredClone(INITIAL_STATES) };
}

/**
 * Låtsasenheter som sparas i telefonen. Svarar med en liten fördröjning som
 * riktiga enheter, och låter rumstemperaturen sakta närma sig börvärdet.
 */
export class MockAdapter implements DeviceAdapter {
  readonly label = 'Demo-läge · låtsasenheter';
  private state: Saved = load();
  private listeners = new Set<(e: AdapterEvent) => void>();
  private timer: number | undefined;

  async connect(): Promise<Snapshot> {
    this.timer = window.setInterval(() => this.tick(), 6000);
    return { devices: structuredClone(this.state.devices), alarm: this.state.alarm, outdoor: -3, pricePerKwh: 0.42 };
  }

  disconnect() { window.clearInterval(this.timer); }

  subscribe(listener: (e: AdapterEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async setDevice(id: string, patch: Partial<DeviceState>) {
    await this.setMany({ [id]: patch });
  }

  async setMany(patches: Record<string, Partial<DeviceState>>) {
    await wait(60);
    const now = Date.now();
    for (const [id, patch] of Object.entries(patches)) {
      const cur = this.state.devices[id];
      if (!cur) continue;
      const next = { ...cur, ...patch, changedAt: now };
      this.state.devices[id] = next;
      this.emit({ type: 'device', id, state: next, source: 'user' });
    }
    this.save();
  }

  async setAlarm(mode: AlarmMode) {
    await wait(60);
    this.state.alarm = mode;
    this.emit({ type: 'alarm', mode });
    this.save();
  }

  async addDevice(id: string, initial: DeviceState) {
    this.state.devices[id] = { ...initial, changedAt: Date.now() };
    this.emit({ type: 'device', id, state: this.state.devices[id], source: 'device' });
    this.save();
  }

  /** Rumstemperaturen rör sig mot börvärdet – så att siffrorna lever. */
  private tick() {
    let changed = false;
    for (const [id, s] of Object.entries(this.state.devices)) {
      if (s.reading === undefined) continue;
      const target = s.on && s.mode !== 'off' ? s.value : 17;
      const diff = target - s.reading;
      if (Math.abs(diff) < 0.05) continue;
      const reading = Math.round((s.reading + Math.sign(diff) * Math.min(0.1, Math.abs(diff))) * 10) / 10;
      this.state.devices[id] = { ...s, reading };
      this.emit({ type: 'device', id, state: this.state.devices[id], source: 'device' });
      changed = true;
    }
    if (changed) this.save();
  }

  private emit(e: AdapterEvent) { this.listeners.forEach((l) => l(e)); }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* fullt eller blockerat */ }
  }
}

export function resetMock() {
  try { localStorage.removeItem(KEY); } catch { /* ignoreras */ }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
