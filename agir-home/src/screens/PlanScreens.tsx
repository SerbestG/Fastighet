import { useState } from 'react';
import { PlanScreen } from '../components/PlanScreen';
import type { Layer } from '../components/FloorPlan';
import { AgirButton, Header, Pills, RoundLink } from '../components/ui';
import { ALARM_MODES, HOME_SCENES, LIGHT_SCENES } from '../home/scenes';
import { allPlacements, applyScene, placement, sceneById, setAlarm, useApp, type AppState } from '../state/store';
import { NewScenePill } from '../components/SceneSaver';
import { fmtNum, fmtTemp, indoorTemp, kwhToday, openWindows, priceNow, totalPower } from '../state/derived';

const unread = (s: AppState) => s.events.some((e) => e.action && !e.done);

function Stat({ dot, children }: { dot?: string; children: React.ReactNode }) {
  return (
    <span className="stat">
      {dot && <span className="pill-dot" aria-hidden="true" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />}
      {children}
    </span>
  );
}

const HeaderBell = () => {
  const dot = useApp(unread);
  return <RoundLink to="/handelser" label="Händelser" icon="bell" dot={dot} />;
};

export function Hem() {
  const s = useApp((x) => x);
  const lock = allPlacements(s).find((p) => p.kind === 'lock');
  const olast = lock && s.devices[lock.id] && !s.devices[lock.id].on;
  const win = openWindows(s).length;
  const lugn = olast ? 'Dörren är olåst' : win ? `${win} fönster öppet` : 'Allt är lugnt';
  return (
    <PlanScreen ctx="hem" layer="hem" nav
      top={
        <header className="head">
          <span className="varumarke">AGIR HOME</span>
          <div className="head-row">
            <div className="head-text">
              <span className="status" style={olast || win ? { color: '#F0A030', fontWeight: 600 } : { fontWeight: 600 }}>
                {lugn} · {fmtTemp(indoorTemp(s))} inne · {fmtTemp(s.outdoor)} ute
              </span>
              <h1>Villa Agir</h1>
            </div>
            <div className="head-knappar">
              <RoundLink to="/meny" label="Meny" icon="menu" />
              <AgirButton />
            </div>
          </div>
        </header>
      }
      chips={<Pills label="Scener" options={[...HOME_SCENES, ...s.customScenes]} value={s.scene} onPick={(id) => applyScene(sceneById(id)!)} extra={<NewScenePill />} />}
    />
  );
}

const LAYERS: { id: Layer; label: string }[] = [
  { id: 'allt', label: 'Allt' }, { id: 'ljus', label: 'Ljus' }, { id: 'klimat', label: 'Klimat' }, { id: 'sakerhet', label: 'Säkerhet' }, { id: 'media', label: 'Media' },
];

export function Kontroller() {
  const s = useApp((x) => x);
  const [layer, setLayer] = useState<Layer>('allt');
  // Från Enheter och rum: /kontroller?enhet=l1 öppnar enhetens kort direkt.
  const [enhet] = useState(() => {
    const id = new URLSearchParams(location.search).get('enhet');
    return id && placement(id) ? id : null;
  });
  return (
    <PlanScreen ctx="kontroller" layer={layer} defaultSel={enhet}
      top={<Header title="Kontroller" status={`Villa · 186 m² · ${fmtTemp(indoorTemp(s))} inne`} right={<HeaderBell />} />}
      chips={
        <div role="group" aria-label="Visa på ritningen" className="lager">
          {LAYERS.map((l) => (
            <button key={l.id} className={'lagerknapp' + (layer === l.id ? ' is-on' : '')} aria-pressed={layer === l.id} onClick={() => setLayer(l.id)}>{l.label}</button>
          ))}
        </div>
      }
    />
  );
}

export function Ljus() {
  const sc = useApp((x) => x.lightScene);
  const custom = useApp((x) => x.customScenes);
  return (
    <PlanScreen ctx="ljus" layer="ljus"
      top={<Header title="Ljus" status="Tryck på en lampa och dra" right={<HeaderBell />} />}
      chips={<Pills label="Ljusscener" options={[...LIGHT_SCENES, ...custom]} value={sc} onPick={(id) => applyScene(sceneById(id)!, 'light')} extra={<NewScenePill />} />}
    />
  );
}

export function Klimat() {
  const s = useApp((x) => x);
  const smart = allPlacements(s).filter((p) => p.kind === 'heat').some((p) => s.devices[p.id]?.mode === 'eco');
  return (
    <PlanScreen ctx="klimat" layer="klimat"
      top={<Header title="Klimat" status={`Ute ${fmtTemp(s.outdoor)} · elpris ${fmtNum(priceNow(), 2)} kr/kWh`} right={<HeaderBell />} />}
      chips={
        <div className="stats">
          <Stat dot="#FFB46E">Inne {fmtTemp(indoorTemp(s))}</Stat>
          <Stat dot="#6FB6FF">Ute {fmtTemp(s.outdoor)}</Stat>
          <Stat dot={smart ? '#2CC56F' : '#6C6E72'}>{smart ? 'Smart värme' : 'Komfort överallt'}</Stat>
        </div>
      }
    />
  );
}

export function Energi() {
  const s = useApp((x) => x);
  const kw = totalPower(s);
  return (
    <PlanScreen ctx="energi" layer="energi"
      top={<Header title="Energi" status="312 kr sparat i november" statusColor="#2CC56F" right={<HeaderBell />} />}
      chips={
        <div className="stats">
          <Stat dot="#2CC56F">{fmtNum(Math.round(kw * 10) / 10)} kW nu</Stat>
          <Stat>{Math.round(kwhToday(s))} kWh idag</Stat>
          <Stat dot={priceNow() > 0.9 ? '#F0A030' : '#FFB46E'}>{fmtNum(priceNow(), 2)} kr</Stat>
        </div>
      }
    />
  );
}

export function Sakerhet() {
  const alarm = useApp((x) => x.alarm);
  return (
    <PlanScreen ctx="sakerhet" layer="sakerhet"
      top={<Header title="Säkerhet" status="Larm, lås och kameror" right={<HeaderBell />} />}
      chips={<Pills label="Larm" options={ALARM_MODES} value={alarm} onPick={(m) => setAlarm(m)} />}
    />
  );
}
