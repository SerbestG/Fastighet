import { useState } from 'react';
import type { ChargeMode, HeatMode, Tone } from '../devices/types';
import { roomById } from '../home/model';
import { TONES, toneOf } from '../home/tones';
import { placement, setDevice, useApp } from '../state/store';
import { clock, fmtNum, fmtTemp, PRICE_CURVE } from '../state/derived';
import { GlowSlider } from './GlowSlider';
import { Icon } from './Icon';
import { Pills, Switch } from './ui';
import { toast } from './toast';

const TONE_OPTS = (Object.keys(TONES) as Tone[]).map((id) => ({ id, label: TONES[id].label, dot: TONES[id].hex }));
const HEAT_OPTS: { id: HeatMode; label: string; dot: string }[] = [
  { id: 'comfort', label: 'Komfort', dot: '#FFB46E' }, { id: 'eco', label: 'Eko', dot: '#2CC56F' }, { id: 'off', label: 'Av', dot: '#6C6E72' },
];
const CHARGE_OPTS: { id: ChargeMode; label: string; dot: string }[] = [
  { id: 'smart', label: 'Smart', dot: '#2CC56F' }, { id: 'now', label: 'Ladda nu', dot: '#E6CFA6' }, { id: 'pause', label: 'Paus', dot: '#6C6E72' },
];

const cheapWindow = () => {
  const s = PRICE_CURVE.map((p, h) => ({ p, h })).sort((a, b) => a.p - b.p).slice(0, 3).map((x) => x.h).sort((a, b) => a - b);
  return `${String(s[0]).padStart(2, '0')}–${String(s[s.length - 1] + 1).padStart(2, '0')}`;
};

export function DeviceSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const s = useApp((x) => x);
  const p = placement(id, s);
  const d = s.devices[id];
  const [live, setLive] = useState(false);
  if (!p || !d) return null;
  const set = (patch: Parameters<typeof setDevice>[1]) => setDevice(id, patch);
  const since = d.changedAt ? clock(d.changedAt) : '21:12';

  const head = (
    <div className="ark-huvud">
      <div className="ark-titlar">
        <span className="ark-kicker">{roomById(p.room)?.name}</span>
        <span className="ark-namn">{p.name}</span>
      </div>
      <button className="stang" onClick={onClose} aria-label="Stäng"><Icon name="close" size={16} stroke={1.5} /></button>
    </div>
  );

  if (p.kind === 'light') {
    const t = toneOf(d.tone);
    const v = d.on ? d.value : 0;
    return (
      <>
        {head}
        <div className="stor-rad">
          <span className="stor-siffra" aria-live="polite">{d.on ? d.value : 'Av'}{d.on && <span className="enhet"> %</span>}</span>
          <button className="kraft tryck" role="switch" aria-checked={d.on} aria-label={p.name} onClick={() => set({ on: !d.on, value: d.value || 70 })}
            style={d.on ? { background: t.hex, color: '#2A1A08', boxShadow: `0 0 26px rgba(${t.rgb},0.5)` } : undefined}>
            <Icon name="power" size={22} stroke={2.2} />
          </button>
        </div>
        <GlowSlider value={v} min={0} max={100} step={1} look="light" tone={t} icon="sun" label="Ljusstyrka" valueText={v ? `${v} procent` : 'Av'}
          onChange={(x) => (x <= 0 ? set({ on: false }) : set({ on: true, value: x }))} />
        <Pills label="Ljusfärg" options={TONE_OPTS} value={d.tone ?? 'warm'} onPick={(tone) => set({ tone, on: true, value: d.value || 70 })} />
      </>
    );
  }

  if (p.kind === 'heat') {
    const mode = (d.mode as HeatMode) ?? 'comfort';
    const off = mode === 'off' || !d.on;
    return (
      <>
        {head}
        <div className="stor-rad">
          <span className="stor-siffra" aria-live="polite">{off ? 'Av' : fmtTemp(d.value)}</span>
          <span className="stor-cap" style={{ color: mode === 'eco' ? '#2CC56F' : undefined }}>
            {off ? 'Golvvärmen är avstängd' : mode === 'eco' ? 'Eko · sparar ca 9 kr/vecka' : `Nu ${fmtTemp(d.reading ?? d.value)} · följer elpriset`}
          </span>
        </div>
        <GlowSlider value={d.value} min={15} max={30} step={0.5} look="heat" icon="heat" label="Temperatur" valueText={`${fmtNum(d.value)} grader`}
          onChange={(x) => set({ value: x, on: true, mode: mode === 'off' ? 'comfort' : mode })} />
        <Pills label="Läge" options={HEAT_OPTS} value={off ? 'off' : mode}
          onPick={(m) => set({ mode: m, on: m !== 'off', value: m === 'eco' ? Math.min(d.value, 19.5) : m === 'comfort' && d.value < 20.5 ? 21.5 : d.value })} />
      </>
    );
  }

  if (p.kind === 'charger') {
    const mode = (d.mode as ChargeMode) ?? 'smart';
    const cap = !d.on ? 'Ingen bil ansluten' : mode === 'smart' ? `Laddar ${cheapWindow()}, när elen är billigast` : mode === 'now' ? 'Laddar nu · 7,4 kW' : 'Laddningen är pausad';
    return (
      <>
        {head}
        <div className="stor-rad">
          <span className="stor-siffra" aria-live="polite">{d.value}<span className="enhet"> %</span></span>
          <span className="stor-cap" style={{ color: mode === 'pause' || !d.on ? undefined : '#2CC56F' }}>{cap}</span>
        </div>
        <GlowSlider value={d.value} min={50} max={100} step={5} look="charge" icon="bolt" label="Laddgräns" valueText={`${d.value} procent`}
          onChange={(x) => set({ value: x })} />
        <Pills label="Laddläge" options={CHARGE_OPTS} value={mode} onPick={(m) => set({ mode: m })} />
      </>
    );
  }

  if (p.kind === 'blind' || p.kind === 'media') {
    const isBlind = p.kind === 'blind';
    const v = d.value;
    return (
      <>
        {head}
        <div className="intervall">
          <Switch on={d.on} label={p.name} onToggle={() => set({ on: !d.on })} />
          <div className="intervall-reglage">
            <GlowSlider value={v} min={0} max={100} step={1} look="plain" icon={isBlind ? 'blinds' : 'media'} label={isBlind ? 'Öppen' : 'Volym'} valueText={`${v} procent`}
              onChange={(x) => set({ value: x, on: true })} />
          </div>
          <span className="intervall-varde">{v}%</span>
        </div>
        {isBlind && (
          <div className="snabbrad">
            <button className="pill tryck" onClick={() => set({ on: true, value: 0 })}>Stäng</button>
            <button className="pill tryck" onClick={() => set({ on: true, value: 50 })}>Halvvägs</button>
            <button className="pill tryck" onClick={() => set({ on: true, value: 100 })}>Öppna</button>
          </div>
        )}
      </>
    );
  }

  // Lås, kamera, läckagevakt, fönster: status + en tydlig handling.
  let status = '';
  let action = '';
  let run = () => {};
  if (p.kind === 'lock') {
    status = d.on ? `Låst sedan ${since}. Låses automatiskt efter två minuter.` : 'Olåst. Låses automatiskt om två minuter.';
    action = d.on ? 'Lås upp' : 'Lås';
    run = () => set({ on: !d.on });
  } else if (p.kind === 'camera') {
    status = 'Live från entrén. Senaste rörelse 21:38, ett bud.';
    action = 'Öppna livebild';
    run = () => setLive(true);
  } else if (p.kind === 'leak') {
    status = d.alert ? 'Vatten upptäckt!' : d.on ? `Torrt. Inga läckor. Batteri ${d.battery ?? 90} %.` : 'Vattnet är avstängt.';
    action = d.on ? 'Stäng vattnet' : 'Slå på vattnet';
    run = () => set({ on: !d.on, alert: false });
  } else if (p.kind === 'window') {
    status = d.on ? 'Stängt.' : `Öppet sedan ${since}. Golvvärmen i rummet är pausad.`;
    action = d.on ? 'Påminn om det öppnas' : 'Påminn mig om 15 min';
    run = () => toast(d.on ? 'Jag säger till om fönstret öppnas.' : `Jag påminner dig ${clock(Date.now() + 15 * 60000)}.`);
  }

  return (
    <>
      {head}
      <span className="ark-text">{status}</span>
      <button className="knapp-acc tryck" onClick={run}>{action}</button>
      {live && <CameraLive onClose={() => setLive(false)} />}
    </>
  );
}

function CameraLive({ onClose }: { onClose: () => void }) {
  return (
    <div className="kamera in" role="dialog" aria-modal="true" aria-label="Livebild från entrén">
      <div className="kamera-bild">
        <span className="kamera-live"><span className="rec" aria-hidden="true" />LIVE · Entré</span>
        <span className="kamera-tid">{clock(Date.now())}</span>
        <span className="kamera-tom">Demo-läge · ingen kamera ansluten</span>
      </div>
      <div className="kamera-knappar">
        <button className="pill tryck" onClick={() => toast('Mikrofonen är på i 10 sekunder.')}><Icon name="mic" size={16} />Prata</button>
        <button className="pill tryck" onClick={() => toast('Bild sparad i Händelser.')}><Icon name="camera" size={16} />Spara bild</button>
        <button className="pill tryck is-on" onClick={onClose}>Stäng</button>
      </div>
    </div>
  );
}
