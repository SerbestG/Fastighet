/**
 * Enhetslagret. UI:t känner bara till de här typerna – aldrig Home Assistant,
 * Matter eller låtsasenheterna direkt. En adapter översätter till och från
 * den riktiga källan.
 */

export type DeviceKind =
  | 'light'    // dimbar lampa: on, value = ljusstyrka 0–100, tone
  | 'heat'     // golvvärme: value = börvärde °C, mode komfort/eko/av, reading = rumstemp
  | 'lock'     // lås: on = låst
  | 'blind'    // persienn: value = öppen 0–100
  | 'camera'   // kamera: on = online
  | 'leak'     // läckagevakt: on = vattnet på (torrt), alert = läcka
  | 'window'   // fönstersensor: on = stängt
  | 'media'    // högtalare: on = spelar, value = volym 0–100
  | 'charger'; // laddbox: on = bil ansluten, value = laddgräns 50–100, mode smart/nu/paus

export type Tone = 'warm' | 'neutral' | 'cool';
export type HeatMode = 'comfort' | 'eco' | 'off';
export type ChargeMode = 'smart' | 'now' | 'pause';
export type AlarmMode = 'off' | 'perimeter' | 'full';

export interface DeviceState {
  on: boolean;
  value: number;
  tone?: Tone;
  mode?: HeatMode | ChargeMode;
  /** Uppmätt värde, t.ex. rumstemperatur. */
  reading?: number;
  /** Effekt just nu i kW (om enheten mäter det). */
  power?: number;
  alert?: boolean;
  battery?: number;
  /** Tidpunkt (ms) för senaste ändringen. */
  changedAt?: number;
}

export type DeviceStates = Record<string, DeviceState>;

export interface Snapshot {
  devices: DeviceStates;
  alarm: AlarmMode;
  /** Utetemperatur och elpris kommer från samma källa som enheterna. */
  outdoor?: number;
  pricePerKwh?: number;
}

export type AdapterEvent =
  | { type: 'device'; id: string; state: DeviceState; source: 'user' | 'device' | 'automation' }
  | { type: 'alarm'; mode: AlarmMode }
  | { type: 'connection'; online: boolean };

export interface DeviceAdapter {
  /** Visas i Inställningar, t.ex. "Demo-läge" eller "Home Assistant". */
  readonly label: string;
  connect(): Promise<Snapshot>;
  setDevice(id: string, patch: Partial<DeviceState>): Promise<void>;
  /** Flera ändringar på en gång (scener). Adaptern får skicka dem i ett anrop. */
  setMany(patches: Record<string, Partial<DeviceState>>): Promise<void>;
  setAlarm(mode: AlarmMode): Promise<void>;
  /** Ny enhet från "Lägg till enhet". */
  addDevice(id: string, initial: DeviceState): Promise<void>;
  subscribe(listener: (e: AdapterEvent) => void): () => void;
  disconnect(): void;
}
