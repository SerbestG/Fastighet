import type { AlarmMode, DeviceState } from '../devices/types';

export interface Scene {
  id: string;
  label: string;
  dot: string;
  patches: Record<string, Partial<DeviceState>>;
  alarm?: AlarmMode;
  /** Vad Agir säger när scenen startas. */
  say: string;
}

const off = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { on: false }]));
const ALL_LIGHTS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'];

/** Scener på Hem. */
export const HOME_SCENES: Scene[] = [
  { id: 'hemma', label: 'Hemma', dot: '#FFB35C', say: 'Välkommen hem. Hallen och köket är tända och larmet är avstängt.',
    patches: { l1: { on: true, value: 70 }, l2: { on: true, value: 100 }, l4: { on: true, value: 40 }, l6: { on: true, value: 60 }, l8: { on: true, value: 80 }, k1: { on: true } },
    alarm: 'off' },
  { id: 'borta', label: 'Borta', dot: '#E6CFA6', say: 'Huset är låst och larmat. Jag tänder lite då och då så det ser ut som att någon är hemma.',
    patches: { ...off(...ALL_LIGHTS, 'm1', 'm2'), k1: { on: true } }, alarm: 'full' },
  { id: 'natt', label: 'Natt', dot: '#A78BFA', say: 'God natt. Allt är låst och hallen lyser svagt om någon går upp.',
    patches: { ...off(...ALL_LIGHTS), l4: { on: true, value: 5 }, k1: { on: true }, b1: { on: true, value: 0 }, b2: { on: true, value: 0 }, m1: { on: false }, m2: { on: false } },
    alarm: 'perimeter' },
  { id: 'film', label: 'Film', dot: '#F472B6', say: 'Filmdags. Vardagsrummet är nedsläckt och persiennerna nere.',
    patches: { l1: { on: true, value: 15, tone: 'warm' }, l2: { on: true, value: 10 }, l3: { on: false }, l4: { on: false }, b1: { on: true, value: 0 }, m1: { on: true, value: 60 } } },
];

/** Ljusscener på Ljus-skärmen. */
export const LIGHT_SCENES: Scene[] = [
  { id: 'morgon', label: 'Morgon', dot: '#FFE2B8', say: 'Mjukt morgonljus i kök, vardagsrum och hall.',
    patches: { l1: { on: true, value: 40, tone: 'neutral' }, l2: { on: true, value: 80, tone: 'neutral' }, l3: { on: true, value: 50 }, l4: { on: true, value: 30 }, l6: { on: true, value: 60, tone: 'cool' } } },
  { id: 'dag', label: 'Dag', dot: '#FFFFFF', say: 'Fullt dagsljus där ni brukar vara.',
    patches: { l1: { on: true, value: 70 }, l2: { on: true, value: 100 }, l4: { on: true, value: 40 }, l6: { on: true, value: 60 }, l8: { on: true, value: 80 } } },
  { id: 'middag', label: 'Middag', dot: '#FFB35C', say: 'Varmt ljus över matbordet, dämpat runt omkring.',
    patches: { l1: { on: true, value: 40, tone: 'warm' }, l2: { on: true, value: 90 }, l3: { on: true, value: 80, tone: 'warm' }, l4: { on: true, value: 20 } } },
  { id: 'lnatt', label: 'Natt', dot: '#A78BFA', say: 'Allt släckt utom hallen på 5 %.',
    patches: { ...off(...ALL_LIGHTS), l4: { on: true, value: 5 } } },
];

export const ALARM_MODES: { id: AlarmMode; label: string; dot: string }[] = [
  { id: 'off', label: 'Avlarmat', dot: '#6C6E72' },
  { id: 'perimeter', label: 'Skalskydd', dot: '#F0A030' },
  { id: 'full', label: 'Fullt larm', dot: '#E5484D' },
];

export const ALL_LIGHT_IDS = ALL_LIGHTS;
