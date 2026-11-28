import type { AdapterEvent, AlarmMode, DeviceAdapter, DeviceState, Snapshot } from './types';

/**
 * Riktiga enheter där de finns, låtsasenheter för resten.
 * Så kan man koppla in en Sunricher-dimmer i taget utan att resten av huset försvinner.
 */
export class HybridAdapter implements DeviceAdapter {
  readonly label: string;
  constructor(private real: DeviceAdapter, private demo: DeviceAdapter, private isReal: (id: string) => boolean, private realAlarm = false) {
    this.label = `${real.label} + demo`;
  }

  async connect(): Promise<Snapshot> {
    const demo = await this.demo.connect();
    try {
      const real = await this.real.connect();
      return { ...demo, devices: { ...demo.devices, ...real.devices }, alarm: this.realAlarm ? real.alarm : demo.alarm };
    } catch (e) {
      // Home Assistant svarar inte: visa demo, men säg till.
      queueMicrotask(() => this.listeners.forEach((l) => l({ type: 'connection', online: false })));
      console.warn('Home Assistant:', e);
      return demo;
    }
  }

  private listeners = new Set<(e: AdapterEvent) => void>();
  subscribe(listener: (e: AdapterEvent) => void) {
    this.listeners.add(listener);
    const a = this.real.subscribe((e) => { if (e.type !== 'device' || this.isReal(e.id)) listener(e); });
    const b = this.demo.subscribe((e) => { if (e.type === 'device' && this.isReal(e.id)) return; if (e.type === 'alarm' && this.realAlarm) return; listener(e); });
    return () => { this.listeners.delete(listener); a(); b(); };
  }

  setDevice(id: string, patch: Partial<DeviceState>) {
    return (this.isReal(id) ? this.real : this.demo).setDevice(id, patch);
  }

  async setMany(patches: Record<string, Partial<DeviceState>>) {
    const real: typeof patches = {}, demo: typeof patches = {};
    for (const [id, p] of Object.entries(patches)) (this.isReal(id) ? real : demo)[id] = p;
    await Promise.all([this.real.setMany(real), this.demo.setMany(demo)]);
  }

  setAlarm(mode: AlarmMode) { return (this.realAlarm ? this.real : this.demo).setAlarm(mode); }
  addDevice(id: string, initial: DeviceState) { return this.demo.addDevice(id, initial); }
  disconnect() { this.real.disconnect(); this.demo.disconnect(); }
}
