import { useState } from 'react';
import { createPortal } from 'react-dom';
import { isLightLike, roomById } from '../home/model';
import { toneOf } from '../home/tones';
import { allPlacements, saveScene, useApp } from '../state/store';
import { deviceStatus } from '../state/derived';
import { Icon } from './Icon';
import { toast } from './toast';

const DOTS = ['#FFB35C', '#E6CFA6', '#A78BFA', '#F472B6', '#6FB6FF', '#2CC56F'];

/** "+ Ny scen": ställ in ljuset som du vill ha det, välj enheter, ge ett namn. */
export function NewScenePill() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="pill ny tryck" onClick={() => setOpen(true)}><Icon name="plus" size={14} stroke={2.2} />Ny scen</button>
      {open && createPortal(<SceneSaver onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function SceneSaver({ onClose }: { onClose: () => void }) {
  const s = useApp((x) => x);
  const cands = allPlacements(s).filter((p) => isLightLike(p) || p.kind === 'blind' || p.kind === 'media');
  const [name, setName] = useState('');
  const [dot, setDot] = useState(DOTS[0]);
  const [sel, setSel] = useState<string[]>(() => cands.filter((p) => s.devices[p.id]?.on || p.kind === 'blind').map((p) => p.id));
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const ok = name.trim().length > 0 && sel.length > 0;

  return (
    <div className="dialog-bakgrund" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Spara som scen" onClick={(e) => e.stopPropagation()}>
        <div className="ark-huvud">
          <span className="dialog-titel">Spara som scen</span>
          <button className="stang" onClick={onClose} aria-label="Stäng"><Icon name="close" size={16} stroke={1.5} /></button>
        </div>
        <span className="rad-sub">Scenen sparar hur de valda enheterna står just nu. Ställ in ljuset först, och tryck sedan Spara.</span>
        <input className="agir-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn, t.ex. Läsa, Middag, Barnen sover" aria-label="Scenens namn" autoFocus />
        <div className="chips" role="group" aria-label="Färg">
          {DOTS.map((c) => (
            <button key={c} className={'pill tryck' + (dot === c ? ' is-on' : '')} aria-pressed={dot === c} aria-label={`Färg ${c}`} onClick={() => setDot(c)} style={{ minWidth: 44 }}>
              <span className="pill-dot" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
            </button>
          ))}
        </div>
        <span className="mini-label">ENHETER I SCENEN · {sel.length}</span>
        <div>
          {cands.map((p) => {
            const d = s.devices[p.id];
            const lit = isLightLike(p) && d?.on;
            return (
              <label key={p.id} className="val-rad">
                <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="rad-text"><span className="rad-titel">{p.name} · {roomById(p.room)?.name}</span><span className="rad-sub">{deviceStatus(p, s)}</span></span>
                {lit && <span className="pill-dot" aria-hidden="true" style={{ background: toneOf(d.tone).hex, boxShadow: `0 0 8px ${toneOf(d.tone).hex}` }} />}
              </label>
            );
          })}
        </div>
        <button className={'knapp-stor tryck' + (ok ? '' : ' av')} disabled={!ok} onClick={() => { const sc = saveScene(name.trim(), sel, dot); toast(`Scenen ${sc.label} är sparad.`); onClose(); }}>
          {ok ? `Spara ${name.trim()}` : 'Ge scenen ett namn'}
        </button>
      </div>
    </div>
  );
}
