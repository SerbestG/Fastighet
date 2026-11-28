import type { AdapterEvent, AlarmMode, DeviceAdapter, DeviceKind, DeviceState, DeviceStates, Snapshot } from './types';
import { circadian } from '../home/tones';

/**
 * Home Assistant via REST + WebSocket.
 *
 * Varje enhet i ritningen kopplas till en entitet i Home Assistant genom
 * ENTITY_MAP. Byt entitetsnamnen mot era egna – UI:t behöver inte ändras.
 *
 *   light.*         → light  (brightness 0–255, color_temp_kelvin)
 *   climate.*       → heat   (temperature, current_temperature, hvac_mode/preset)
 *   lock.*          → lock
 *   cover.*         → blind  (current_position)
 *   camera.*        → camera
 *   binary_sensor.* → leak / window (device_class moisture / window)
 *   media_player.*  → media  (volume_level 0–1)
 *   switch.* / number.* → charger (beror på laddboxens integration)
 *   alarm_control_panel.* → husets larm
 */
export const ENTITY_MAP: Record<string, string> = {
  l1: 'light.vardagsrum_tak', l2: 'light.kok_bank', l3: 'light.matplats_pendlar', l4: 'light.hall_spotlights',
  l5: 'light.sovrum_tak', l6: 'light.badrum_spotlights', l7: 'light.barnrum_tak', l8: 'light.allrum_tak',
  h1: 'climate.vardagsrum_golv', h2: 'climate.kok_golv', h3: 'climate.arbetsrum_golv',
  h4: 'climate.sovrum_golv', h5: 'climate.badrum_golv', h6: 'climate.barnrum_golv',
  b1: 'cover.vardagsrum_persienner', b2: 'cover.sovrum_morklaggning',
  k1: 'lock.ytterdorr', c1: 'camera.entre',
  s1: 'binary_sensor.tvatt_lacka', s2: 'binary_sensor.badrum_lacka',
  w1: 'binary_sensor.arbetsrum_fonster', w2: 'binary_sensor.barnrum_fonster',
  m1: 'media_player.vardagsrum', m2: 'media_player.allrum',
  e1: 'switch.laddbox',
  st1: 'light.kok_ledlist', st2: 'light.sovrum_ledlist',
  p1: 'light.vardagsrum_golvlampa', p2: 'switch.kok_kaffebryggare',
  r1: 'switch.wc_flakt', r2: 'switch.utebelysning',
  mo1: 'binary_sensor.hall_rorelse', mo2: 'binary_sensor.badrum_narvaro',
  bt1: 'event.sovrum_vridknapp', bt2: 'event.entre_knapp',
};
const ALARM_ENTITY = 'alarm_control_panel.hemmet';

interface HAState { entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string }

const TONE_K = { warm: 2700, neutral: 3500, cool: 5000 } as const;

export class HomeAssistantAdapter implements DeviceAdapter {
  readonly label = 'Home Assistant';
  private ws: WebSocket | null = null;
  private msgId = 1;
  private listeners = new Set<(e: AdapterEvent) => void>();
  private byEntity = new Map<string, string>();

  /**
   * @param map    Agir-enhet → Home Assistant-entitet, t.ex. { l1: 'light.vardagsrum_tak' }
   * @param kindOf vilken sorts enhet ett Agir-id är (från planlösningen)
   */
  constructor(private baseUrl: string, private token: string, private map: Record<string, string> = ENTITY_MAP,
    private kindOf: (id: string) => DeviceKind | undefined = () => undefined) {
    for (const [id, ent] of Object.entries(map)) this.byEntity.set(ent, id);
  }

  async connect(): Promise<Snapshot> {
    const res = await fetch(`${this.baseUrl}/api/states`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Home Assistant svarade ${res.status}`);
    const all = (await res.json()) as HAState[];
    const devices: DeviceStates = {};
    let alarm: AlarmMode = 'off';
    for (const s of all) {
      const id = this.byEntity.get(s.entity_id);
      if (id) devices[id] = this.toState(id, s);
      if (s.entity_id === (this.map.alarm ?? ALARM_ENTITY)) alarm = toAlarm(s.state);
    }
    this.openSocket();
    return { devices, alarm };
  }

  disconnect() { this.ws?.close(); this.ws = null; }

  subscribe(listener: (e: AdapterEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async setMany(patches: Record<string, Partial<DeviceState>>) {
    await Promise.all(Object.entries(patches).map(([id, p]) => this.setDevice(id, p)));
  }

  async setDevice(id: string, patch: Partial<DeviceState>) {
    const entity = this.map[id];
    const kind = this.kindOf(id);
    if (!entity || !kind) return;
    const call = (domain: string, service: string, data: Record<string, unknown> = {}) =>
      this.call(domain, service, { entity_id: entity, ...data });

    switch (kind) {
      case 'relay':
        if (patch.on !== undefined) return call('switch', patch.on ? 'turn_on' : 'turn_off');
        return;
      case 'plug':
        if (entity.startsWith('switch.')) { if (patch.on !== undefined) return call('switch', patch.on ? 'turn_on' : 'turn_off'); return; }
      // eslint-disable-next-line no-fallthrough
      case 'strip':
      case 'light':
        if (patch.on === false) return call('light', 'turn_off');
        return call('light', 'turn_on', {
          ...(patch.value !== undefined ? { brightness_pct: patch.value } : {}),
          ...(patch.tone ? { color_temp_kelvin: TONE_K[patch.tone === 'auto' ? circadian() : patch.tone] } : {}),
        });
      case 'heat':
        if (patch.mode === 'off' || patch.on === false) return call('climate', 'set_hvac_mode', { hvac_mode: 'off' });
        if (patch.mode) await call('climate', 'set_preset_mode', { preset_mode: patch.mode === 'eco' ? 'eco' : 'comfort' });
        if (patch.value !== undefined) return call('climate', 'set_temperature', { temperature: patch.value });
        return;
      case 'lock':
        return call('lock', patch.on ? 'lock' : 'unlock');
      case 'blind':
        return call('cover', 'set_cover_position', { position: patch.value ?? (patch.on ? 100 : 0) });
      case 'media':
        if (patch.value !== undefined) await call('media_player', 'volume_set', { volume_level: patch.value / 100 });
        if (patch.on !== undefined) return call('media_player', patch.on ? 'media_play' : 'media_pause');
        return;
      case 'charger':
        if (patch.mode) return call('switch', patch.mode === 'pause' ? 'turn_off' : 'turn_on');
        return;
      case 'leak':
        // Vattenventilen är oftast en egen entitet: valve.huvudkran
        if (patch.on !== undefined) return this.call('valve', patch.on ? 'open_valve' : 'close_valve', { entity_id: 'valve.huvudkran' });
        return;
      default:
        return;
    }
  }

  async setAlarm(mode: AlarmMode) {
    const service = mode === 'off' ? 'alarm_disarm' : mode === 'perimeter' ? 'alarm_arm_home' : 'alarm_arm_away';
    await this.call('alarm_control_panel', service, { entity_id: this.map.alarm ?? ALARM_ENTITY });
  }

  async addDevice() {
    // Nya enheter läggs till i Home Assistant och kopplas sedan i ENTITY_MAP.
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async call(domain: string, service: string, data: Record<string, unknown>) {
    await fetch(`${this.baseUrl}/api/services/${domain}/${service}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(data) });
  }

  private openSocket() {
    const url = this.baseUrl.replace(/^http/, 'ws') + '/api/websocket';
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data as string);
      if (msg.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
      else if (msg.type === 'auth_ok') {
        this.emit({ type: 'connection', online: true });
        ws.send(JSON.stringify({ id: this.msgId++, type: 'subscribe_events', event_type: 'state_changed' }));
      } else if (msg.type === 'event') {
        const ns = msg.event?.data?.new_state as HAState | undefined;
        if (!ns) return;
        if (ns.entity_id === (this.map.alarm ?? ALARM_ENTITY)) { this.emit({ type: 'alarm', mode: toAlarm(ns.state) }); return; }
        const id = this.byEntity.get(ns.entity_id);
        if (id) this.emit({ type: 'device', id, state: this.toState(id, ns), source: 'device' });
      }
    };
    ws.onclose = () => {
      this.emit({ type: 'connection', online: false });
      if (this.ws === ws) setTimeout(() => this.openSocket(), 5000);
    };
  }

  private emit(e: AdapterEvent) { this.listeners.forEach((l) => l(e)); }

  private toState(id: string, s: HAState): DeviceState {
    const a = s.attributes;
    const kind = this.kindOf(id);
    const changedAt = Date.parse(s.last_changed);
    switch (kind) {
      case 'relay': return { on: s.state === 'on', value: 0, changedAt };
      case 'motion': return { on: true, value: 2, lastMotion: s.state === 'on' ? Date.now() : undefined, changedAt };
      case 'button': return { on: true, value: 0, mode: 'toggle', changedAt };
      case 'plug':
        if (s.entity_id.startsWith('switch.')) return { on: s.state === 'on', value: 0, power: Number(a.current_power_w ?? 0) / 1000, changedAt };
      // eslint-disable-next-line no-fallthrough
      case 'strip':
      case 'light': {
        const k = Number(a.color_temp_kelvin ?? 2700);
        return { on: s.state === 'on', value: Math.round((Number(a.brightness ?? 180) / 255) * 100), tone: k < 3100 ? 'warm' : k < 4300 ? 'neutral' : 'cool', changedAt };
      }
      case 'heat':
        return { on: s.state !== 'off', value: Number(a.temperature ?? 21), reading: Number(a.current_temperature ?? 21),
          mode: s.state === 'off' ? 'off' : a.preset_mode === 'eco' ? 'eco' : 'comfort', changedAt };
      case 'lock': return { on: s.state === 'locked', value: 0, changedAt };
      case 'blind': return { on: s.state !== 'closed', value: Number(a.current_position ?? 0), changedAt };
      case 'camera': return { on: s.state !== 'unavailable', value: 0, changedAt };
      case 'leak': return { on: true, value: 0, alert: s.state === 'on', changedAt };
      case 'window': return { on: s.state === 'off', value: 0, changedAt };
      case 'media': return { on: s.state === 'playing', value: Math.round(Number(a.volume_level ?? 0.3) * 100), changedAt };
      case 'charger': return { on: true, value: 80, mode: s.state === 'on' ? 'smart' : 'pause', changedAt };
      default: return { on: s.state === 'on', value: 0, changedAt };
    }
  }
}

function toAlarm(state: string): AlarmMode {
  if (state === 'armed_away' || state === 'armed_night') return 'full';
  if (state === 'armed_home') return 'perimeter';
  return 'off';
}

/* ---------- för "Anslut Home Assistant" i appen ---------- */

export interface HAEntity { id: string; name: string; domain: string; kind: DeviceKind | null; state: string }

const KIND_BY_DOMAIN: Record<string, DeviceKind> = {
  light: 'light', switch: 'relay', cover: 'blind', climate: 'heat', lock: 'lock', media_player: 'media', camera: 'camera',
};

/** Gissar vilken sorts Agir-enhet en entitet är. */
function guessKind(e: HAState): DeviceKind | null {
  const domain = e.entity_id.split('.')[0];
  if (domain === 'binary_sensor') {
    const dc = String(e.attributes.device_class ?? '');
    if (dc === 'moisture') return 'leak';
    if (dc === 'window' || dc === 'door' || dc === 'opening') return 'window';
    if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'motion';
    return null;
  }
  return KIND_BY_DOMAIN[domain] ?? null;
}

/** Hämtar allt som går att styra från Home Assistant. Kastar ett fel med en begriplig text om det inte går. */
export async function fetchEntities(baseUrl: string, token: string): Promise<HAEntity[]> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/states`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Kom inte fram. Kontrollera adressen, att den börjar med https://, och att Agirs adress är tillåten i Home Assistant (se nedan).');
  }
  if (res.status === 401) throw new Error('Nyckeln godkändes inte. Skapa en ny long-lived access token i din profil i Home Assistant.');
  if (!res.ok) throw new Error(`Home Assistant svarade ${res.status}.`);
  const all = (await res.json()) as HAState[];
  return all
    .map((e) => ({ id: e.entity_id, name: String(e.attributes.friendly_name ?? e.entity_id), domain: e.entity_id.split('.')[0], kind: guessKind(e), state: e.state }))
    .filter((e) => e.kind)
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}
