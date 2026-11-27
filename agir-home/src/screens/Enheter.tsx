import { Header } from '../components/ui';
import { Icon } from '../components/Icon';
import { BATTERY_KINDS, FLOORS, isLightLike, KIND_LABEL, ROOMS } from '../home/model';
import { allPlacements, setView, useApp } from '../state/store';
import { deviceStatus } from '../state/derived';
import { go } from '../router';

const PRODUCT: Partial<Record<string, string>> = {
  light: 'Agir Dosdimmer D1', heat: 'Agir Termostat T1', blind: 'Agir Jalusi J1', leak: 'Agir Läckagevakt', window: 'Agir Fönstersensor',
};

/** Enheter och rum: allt i hemmet med status, batteri och signal. Tryck för att styra. */
export function Enheter() {
  const s = useApp((x) => x);
  const P = allPlacements(s);
  const battery = P.filter((p) => BATTERY_KINDS.includes(p.kind));
  const mains = P.length - battery.length;
  const low = battery.filter((p) => (s.devices[p.id]?.battery ?? 100) < 30);
  const weak = P.filter((p) => (s.devices[p.id]?.signal ?? 100) < 65);

  const active = (id: string) => {
    const p = P.find((x) => x.id === id)!;
    const d = s.devices[id];
    if (!d) return false;
    if (isLightLike(p) || ['relay', 'media'].includes(p.kind) || (p.kind === 'plug')) return d.on;
    return p.kind !== 'button';
  };

  return (
    <div className="skarm lista-skarm">
      <Header title="Enheter och rum" status={`${P.length} enheter i ${ROOMS.length} rum · ${s.online ? 'allt online' : 'offline'}`} backTo="/installningar" backLabel="Inställningar" />

      <div className="enh-sammanfattning">
        <span className="stat"><span className="pill-dot" style={{ background: '#2CC56F', boxShadow: '0 0 8px #2CC56F' }} />Agir Hub online</span>
        <span className="stat">{mains} förstärker Thread-nätet</span>
        <span className="stat"><span className="pill-dot" style={{ background: low.length ? '#F0A030' : '#2CC56F' }} />{low.length ? `${low.length} lågt batteri` : 'Alla batterier OK'}</span>
      </div>

      <div className="tip in" style={{ marginTop: 14 }}>
        <div className="tip-body upd">
          <Icon name="hub" size={26} color="#C9CACD" />
          <div className="upd-text">
            <span className="upd-titel">Agir Hub</span>
            <span className="tip-text dim">
              Matter över Thread · fungerar utan internet · batteribackup 4 timmar vid strömavbrott.
              {weak.length ? ` ${weak.length} enheter har svag signal – varje nätansluten enhet du lägger till förstärker nätet.` : ' Alla enheter har god signal.'}
            </span>
          </div>
        </div>
      </div>

      {FLOORS.map((f) => (
        <div key={f.id}>
          <span className="sektion">{f.label}</span>
          {ROOMS.filter((r) => r.floor === f.id).map((r) => {
            const dv = P.filter((p) => p.room === r.id);
            if (!dv.length) return null;
            return (
              <section key={r.id} className="enh-rum" aria-label={r.name}>
                <div className="enh-rum-huvud"><span className="enh-rum-namn">{r.name}</span><span className="rad-sub">{dv.length} enheter</span></div>
                {dv.map((p) => {
                  const d = s.devices[p.id];
                  const bat = BATTERY_KINDS.includes(p.kind) ? d?.battery ?? 100 : null;
                  const sig = d?.signal ?? 90;
                  return (
                    <button key={p.id} className="enh-rad tryck" onClick={() => { setView({ floor: p.floor }); go(`/kontroller?enhet=${p.id}`); }}>
                      <span className={'enh-ikon' + (active(p.id) ? ' pa' : '')} aria-hidden="true"><Icon name={p.kind} size={17} stroke={1.8} /></span>
                      <span className="enh-text">
                        <span className="enh-namn">{p.name}</span>
                        <span className="enh-sub">{deviceStatus(p, s)} · {p.product ?? PRODUCT[p.kind] ?? KIND_LABEL[p.kind]}</span>
                      </span>
                      <span className="enh-meta">
                        <span className={sig < 65 ? 'lag' : ''} aria-label={`Signal ${sig} procent`}><Icon name="signal" size={12} stroke={2} />{sig}%</span>
                        {bat !== null && <span className={bat < 30 ? 'lag' : ''} aria-label={`Batteri ${bat} procent`}><Icon name="battery" size={12} stroke={2} />{bat}%</span>}
                      </span>
                    </button>
                  );
                })}
              </section>
            );
          })}
        </div>
      ))}
      <div style={{ padding: '20px 16px 0' }}>
        <button className="knapp-stor tryck" style={{ width: '100%' }} onClick={() => go('/lagg-till')}>Lägg till enhet</button>
      </div>
    </div>
  );
}
