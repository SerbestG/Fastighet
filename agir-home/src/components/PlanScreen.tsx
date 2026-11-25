import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { insightFor, summaryLine, type Context } from '../agir/insights';
import { FLOORS, roomById, type FloorId } from '../home/model';
import { dismiss, placement, setDevice, setView, useApp } from '../state/store';
import { DeviceSheet } from './DeviceSheet';
import { FloorPlan, roomStats, type Layer } from './FloorPlan';
import { Icon } from './Icon';
import { Link, Segment } from './ui';

interface Props {
  ctx: Context;
  layer: Layer;
  top: ReactNode;
  /** Rad under våning/vy – scener, lager eller nyckeltal. */
  chips?: ReactNode;
  defaultSel?: string | null;
  nav?: boolean;
}

const NAV = [
  { to: '/kontroller', label: 'Kontroller', dot: '#FFB35C' },
  { to: '/klimat', label: 'Klimat', dot: '#FF9B57' },
  { to: '/energi', label: 'Energi', dot: '#2CC56F' },
  { to: '/sakerhet', label: 'Säkerhet', dot: '#E6CFA6' },
];

/** Skärmarna med 3D-huset: Hem, Kontroller, Ljus, Klimat, Energi, Säkerhet. */
export function PlanScreen({ ctx, layer, top, chips, defaultSel = null, nav }: Props) {
  const s = useApp((x) => x);
  const [sel, setSel] = useState<string | null>(defaultSel);
  const [rsel, setRsel] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);

  // Byter man våning stängs kort som hör till den andra våningen.
  useEffect(() => {
    const p = sel ? placement(sel) : null;
    if (p && p.floor !== s.view.floor) setSel(null);
    if (rsel && roomById(rsel)?.floor !== s.view.floor) { setRsel(null); setRoom(null); }
  }, [s.view.floor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape stänger det översta: enhet → rum → helvy.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (sel) setSel(null); else if (room) setRoom(null); else if (rsel) setRsel(null);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel, room, rsel]);

  const close = () => { if (sel) setSel(null); else { setRsel(null); setRoom(null); } };

  // Huset centreras i ytan ovanför kortet, hur högt kortet än är.
  const screenRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = screenRef.current;
    if (!root) return;
    let ro: ResizeObserver | null = null;
    const watch = () => {
      const ark = root.querySelector('.ark');
      ro?.disconnect();
      if (!ark) return;
      ro = new ResizeObserver(([e]) => root.style.setProperty('--ark-h', `${Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)}px`));
      ro.observe(ark);
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true });
    return () => { ro?.disconnect(); mo.disconnect(); };
  }, []);

  return (
    <div className="skarm plan-skarm" ref={screenRef}>
      <div className="plan-topp">
        {top}
        <div className="kontrollrad">
          <Segment label="Våning" value={s.view.floor} onPick={(f: FloorId) => { setView({ floor: f }); setRoom(null); setRsel(null); }} options={FLOORS} />
          <Segment label="Vy" value={s.view.mode} onPick={(m) => setView({ mode: m })} options={[{ id: '2d', label: '2D' }, { id: '3d', label: '3D' }]} />
        </div>
        {chips}
      </div>

      <FloorPlan layer={layer} sel={sel} onSel={setSel} rsel={rsel} onRsel={setRsel} room={room} onRoom={setRoom} />

      <Sheet keyId={sel ?? (rsel ? 'r' + rsel : 'agir')} onSwipeDown={sel || rsel ? close : undefined}>
        {sel ? <DeviceSheet id={sel} onClose={() => setSel(null)} />
          : rsel ? <RoomCard id={rsel} open={room === rsel} onOpen={() => setRoom(room ? null : rsel)} onClose={() => { setRsel(null); setRoom(null); }} />
            : <AgirCard ctx={ctx} nav={nav} />}
      </Sheet>
    </div>
  );
}

function Sheet({ children, keyId, onSwipeDown }: { children: ReactNode; keyId: string; onSwipeDown?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  return (
    <div ref={ref} className="ark" key={keyId} style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
      onPointerDown={(e) => {
        if (!onSwipeDown || (e.target as HTMLElement).closest('[role=slider],button,a')) return;
        start.current = { y: e.clientY, id: e.pointerId };
      }}
      onPointerMove={(e) => { const st = start.current; if (st && st.id === e.pointerId) setDy(Math.max(0, e.clientY - st.y)); }}
      onPointerUp={() => { if (start.current && dy > 70) onSwipeDown?.(); start.current = null; setDy(0); }}
      onPointerCancel={() => { start.current = null; setDy(0); }}>
      {onSwipeDown && <span className="ark-greppe" aria-hidden="true" />}
      {children}
    </div>
  );
}

const compact = () => window.innerHeight < 720;

function AgirCard({ ctx, nav }: { ctx: Context; nav?: boolean }) {
  const s = useApp((x) => x);
  const ins = insightFor(s, ctx);
  return (
    <>
      <span className="agir-kicker">Agir · {summaryLine(s, ctx)}</span>
      <span className="agir-text" aria-live="polite">{ins.text}</span>
      {ins.action && (
        <div className="agir-handling">
          <button className="knapp-acc liten tryck" onClick={ins.action.run}>{ins.action.label}</button>
          <button className="knapp-ghost liten tryck" onClick={() => dismiss(ins.id)}>Inte nu</button>
        </div>
      )}
      {nav && !(ins.action && compact()) ? (
        <nav aria-label="Snabbval" className="snabbval">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="snabb tryck">
              <span className="pill-dot" aria-hidden="true" style={{ background: n.dot, boxShadow: `0 0 8px ${n.dot}` }} />{n.label}
            </Link>
          ))}
        </nav>
      ) : !ins.action && <span className="agir-tips">Tryck på en symbol på ritningen för att styra den.</span>}
    </>
  );
}

function RoomCard({ id, open, onOpen, onClose }: { id: string; open: boolean; onOpen: () => void; onClose: () => void }) {
  const s = useApp((x) => x);
  const R = roomById(id)!;
  const r = roomStats(s, id);
  const on = r.lit > 0;
  return (
    <>
      <div className="ark-huvud">
        <div className="ark-titlar">
          <span className="ark-kicker acc">{[r.temp, R.area].filter(Boolean).join(' · ')}</span>
          <span className="ark-namn">{R.name}</span>
        </div>
        <button className="stang" onClick={onClose} aria-label="Stäng"><Icon name="close" size={16} stroke={1.5} /></button>
      </div>
      <span className="ark-text">
        {open ? 'Tryck på en symbol i rummet för att styra den. Vrid rummet med fingret.'
          : `${r.dv.length} enheter i rummet${r.lamps.length ? `, ${r.lit} av ${r.lamps.length} lampor tända` : ''}. Dubbeltryck på rummet för att öppna det direkt.`}
      </span>
      <div className="knapprad">
        <button className="knapp-acc tryck" onClick={onOpen}>{open ? 'Hela huset' : 'Öppna rummet'}</button>
        <button className="knapp-ghost tryck" disabled={!r.lamps.length}
          onClick={() => r.lamps.forEach((l) => setDevice(l.id, { on: !on, value: s.devices[l.id]?.value || 70 }))}>
          {r.lamps.length ? (on ? 'Släck rummet' : 'Tänd rummet') : 'Inga lampor'}
        </button>
      </div>
    </>
  );
}
