import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DeviceKind } from '../devices/types';
import { PLAN_H, PLAN_W, ROOMS, WINDOWS, roomById, type Placement, type Room } from '../home/model';
import { toneOf } from '../home/tones';
import { allPlacements, setView, useApp, type AppState } from '../state/store';
import { fmtKw, fmtTemp, heatColor, roomPower } from '../state/derived';
import { Icon } from './Icon';

export type Layer = 'allt' | 'ljus' | 'klimat' | 'sakerhet' | 'media' | 'energi';

const LAYER_KINDS: Record<Layer, DeviceKind[] | null> = {
  allt: null,
  ljus: ['light'],
  klimat: ['heat', 'blind', 'window'],
  sakerhet: ['lock', 'camera', 'leak', 'window'],
  media: ['media', 'charger', 'blind'],
  energi: ['charger', 'heat'],
};

interface Props {
  layer: Layer;
  sel: string | null;
  onSel: (id: string | null) => void;
  rsel: string | null;
  onRsel: (id: string | null) => void;
  room: string | null;
  onRoom: (id: string | null) => void;
}

const ROOM_BG = '#202124';
const GLOW = '232,200,150';

export function roomStats(s: AppState, roomId: string) {
  const dv = allPlacements(s).filter((p) => p.room === roomId);
  const lamps = dv.filter((p) => p.kind === 'light');
  const lit = lamps.filter((p) => s.devices[p.id]?.on).length;
  const heat = dv.find((p) => p.kind === 'heat');
  const temp = heat && s.devices[heat.id] ? fmtTemp(s.devices[heat.id].value) : null;
  return { dv, lamps, lit, heat, temp };
}

export function FloorPlan({ layer, sel, onSel, rsel, onRsel, room, onRoom }: Props) {
  const s = useApp((x) => x);
  const view = s.view;
  const tre = view.mode === '3d';
  const stageRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 390, h: 400 });
  // Lokal kamera under drag – sparas när fingret släpper.
  const [cam, setCam] = useState({ rz: view.rz, rx: view.rx, zoom: view.zoom, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ pts: Map<number, { x: number; y: number }>; start: typeof cam; moved: boolean; d0: number; x0: number; y0: number } | null>(null);
  const wasDragged = useRef(false);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const camRef = useRef(cam);
  camRef.current = cam;

  useEffect(() => { if (!dragging) setCam((c) => ({ ...c, rz: view.rz, rx: view.rx, zoom: view.zoom })); }, [view.rz, view.rx, view.zoom, dragging]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setArea({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 3D-vyn är lägre än ritningen; 2D behöver hela höjden.
  const fit = Math.max(0.55, Math.min(1.15, area.w / 390, area.h / (tre ? 300 : 330)));

  const P = useMemo(() => allPlacements(s).filter((p) => p.floor === view.floor), [s.extra, view.floor]); // eslint-disable-line react-hooks/exhaustive-deps
  const rooms = ROOMS.filter((r) => r.floor === view.floor);
  const RR = room ? roomById(room) ?? null : null;
  const RV = RR ? { s: Math.min(2.2, 0.78 * Math.min(PLAN_W / RR.w, PLAN_H / RR.h)), tx: PLAN_W / 2 - (RR.x + RR.w / 2), ty: PLAN_H / 2 - (RR.y + RR.h / 2) } : null;

  const planTransform = RV
    ? (tre ? `rotateX(${cam.rx}deg) rotateZ(${cam.rz}deg) ` : '') + `scale(${RV.s}) translate(${RV.tx}px, ${RV.ty}px)`
    : tre ? `rotateX(${cam.rx}deg) rotateZ(${cam.rz}deg) scale(${cam.zoom})` : `translate(${cam.px}px, ${cam.py}px) scale(${cam.zoom.toFixed(3)})`;
  const scaleNow = RV ? RV.s : cam.zoom;
  // Symbolerna håller ungefär samma storlek när man zoomar in.
  const pinScale = Math.pow(1 / Math.max(0.5, scaleNow / 0.8), 0.7);

  /* ---------- gester ---------- */
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return;
    const g = gesture.current ?? { pts: new Map(), start: cam, moved: false, d0: 0, x0: e.clientX, y0: e.clientY };
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    g.start = { ...cam };
    g.x0 = e.clientX; g.y0 = e.clientY;
    if (g.pts.size === 2) { const [a, b] = [...g.pts.values()]; g.d0 = Math.hypot(a.x - b.x, a.y - b.y); }
    gesture.current = g;
  };

  useEffect(() => {
    let raf = 0;
    const move = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || !g.pts.has(e.pointerId)) return;
      g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (g.pts.size >= 2) {
          const [a, b] = [...g.pts.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!g.d0) return;
          g.moved = true; setDragging(true);
          setCam((c) => ({ ...c, zoom: clamp(+(g.start.zoom * (d / g.d0)).toFixed(3), 0.5, 1.6) }));
          return;
        }
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        if (!g.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
        g.moved = true; setDragging(true);
        if (tre) setCam((c) => ({ ...c, rz: g.start.rz + dx * 0.45, rx: clamp(g.start.rx - dy * 0.3, 15, 72) }));
        else if (!room) setCam((c) => ({ ...c, px: clamp(g.start.px + dx, -220, 220), py: clamp(g.start.py + dy, -220, 220) }));
      });
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || !g.pts.has(e.pointerId)) return;
      g.pts.delete(e.pointerId);
      if (g.pts.size === 1) { const [p] = [...g.pts.values()]; g.x0 = p.x; g.y0 = p.y; g.start = { ...camRef.current }; return; }
      if (g.pts.size === 0) {
        wasDragged.current = g.moved;
        gesture.current = null;
        if (g.moved) {
          setDragging(false);
          const c = camRef.current;
          setView({ rz: c.rz, rx: c.rx, zoom: c.zoom });
          // Ett klick som avslutar en drag ska inte räknas som tryck.
          setTimeout(() => { wasDragged.current = false; }, 60);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); cancelAnimationFrame(raf); };
  }, [tre, room]);

  const onWheel = (e: React.WheelEvent) => {
    const zoom = clamp(+(cam.zoom - e.deltaY * 0.0015).toFixed(3), 0.5, 1.6);
    setCam((c) => ({ ...c, zoom }));
    setView({ zoom });
  };

  const zoomBy = (d: number) => { const zoom = clamp(+(view.zoom + d).toFixed(2), 0.5, 1.6); setView({ zoom }); };
  const reset = () => { setView({ rz: -38, rx: 56, zoom: 0.8 }); setCam((c) => ({ ...c, px: 0, py: 0 })); onRoom(null); };

  /* ---------- rum ---------- */
  const tapRoom = (rid: string) => {
    if (wasDragged.current) return;
    const now = Date.now(), lt = lastTap.current;
    lastTap.current = { id: rid, t: now };
    if (lt && lt.id === rid && now - lt.t < 380) { onRoom(rid); onRsel(rid); onSel(null); lastTap.current = null; return; }
    if (room && room !== rid) return;
    onRsel(rid); onSel(null);
  };

  const roomStyle = (r: Room): React.CSSProperties => {
    const lamps = P.filter((p) => p.kind === 'light' && p.room === r.id && s.devices[p.id]?.on);
    const tone = lamps.length ? toneOf(s.devices[lamps[0].id].tone).rgb : GLOW;
    const level = lamps.length ? lamps.reduce((a, p) => a + s.devices[p.id].value, 0) / lamps.length / 100 : 0;
    const heat = P.find((p) => p.kind === 'heat' && p.room === r.id);
    let bg = ROOM_BG;
    let glow = '';
    if (layer === 'energi') {
      const k = Math.min(1, roomPower(s, r.id) / 2);
      bg = `radial-gradient(circle at 50% 50%, rgba(44,197,111,${(0.08 + k * 0.42).toFixed(2)}), rgba(44,197,111,0.02) 76%), ${ROOM_BG}`;
      if (k > 0.3 && tre) glow = `, 0 0 ${Math.round(20 + k * 30)}px rgba(44,197,111,${(k * 0.25).toFixed(2)})`;
    } else if (layer === 'klimat' && heat && s.devices[heat.id]) {
      const hs = s.devices[heat.id];
      const c = hs.mode === 'off' || !hs.on ? '110,150,210' : heatColor(hs.value);
      bg = `radial-gradient(circle at 50% 55%, rgba(${c},${hs.mode === 'off' ? 0.12 : 0.4}), rgba(${c},0.02) 78%), ${ROOM_BG}`;
    } else if (level > 0 && (layer === 'allt' || layer === 'ljus')) {
      bg = `radial-gradient(circle at 50% 42%, rgba(${tone},${(0.12 + level * 0.5).toFixed(2)}), rgba(${tone},0.02) 74%), ${ROOM_BG}`;
      if (tre) glow = `, 0 0 ${Math.round(18 + level * 34)}px rgba(${tone},${(level * 0.22).toFixed(2)})`;
    }
    const dim = RR && r.id !== RR.id;
    const picked = !RR && rsel === r.id;
    return {
      left: r.x + 2, top: r.y + 2, width: r.w - 4, height: r.h - 4, background: bg,
      opacity: dim ? 0.07 : 1,
      outline: picked ? '2px solid var(--acc)' : '0 solid transparent',
      boxShadow: tre ? `0 18px 30px rgba(0,0,0,0.6)${glow}` : 'none',
      pointerEvents: dim ? 'none' : undefined,
    };
  };

  const roomInfo = (r: Room) => {
    if (layer === 'energi') return fmtKw(roomPower(s, r.id));
    const heat = P.find((p) => p.kind === 'heat' && p.room === r.id);
    if (heat && s.devices[heat.id]) {
      const hs = s.devices[heat.id];
      if (layer === 'klimat') return fmtTemp(hs.reading ?? hs.value);
      return fmtTemp(hs.value);
    }
    return r.area;
  };

  /* ---------- symboler ---------- */
  const kinds = LAYER_KINDS[layer];
  const pins = P.filter((p) => (!kinds || kinds.includes(p.kind)) && (!RR || p.room === RR.id));

  const pinLook = (p: Placement) => {
    const d = s.devices[p.id];
    if (!d) return { bg: '#2C2D30', fg: '#A4A6AA', shadow: '0 2px 8px rgba(0,0,0,0.7)', warn: false };
    const warn = (p.kind === 'lock' && !d.on) || (p.kind === 'window' && !d.on) || (p.kind === 'leak' && (!d.on || !!d.alert));
    const lit = p.kind === 'light' && d.on;
    const active = !warn && (p.kind === 'light' || p.kind === 'media' ? d.on : p.kind === 'charger' ? d.mode !== 'pause' : true);
    if (warn) return { bg: '#F0A030', fg: '#18191B', shadow: '0 0 14px rgba(240,160,48,0.55)', warn };
    if (lit) { const t = toneOf(d.tone); return { bg: t.hex, fg: '#2A1A08', shadow: `0 0 16px rgba(${t.rgb},0.6)`, warn }; }
    if (active) return { bg: '#FFFFFF', fg: '#18191B', shadow: '0 2px 8px rgba(0,0,0,0.7)', warn };
    return { bg: '#2C2D30', fg: '#A4A6AA', shadow: '0 2px 8px rgba(0,0,0,0.7)', warn };
  };

  const walls = RR && tre ? glassWalls(RR) : [];
  const hint = RR ? (tre ? 'Dra för att vrida rummet' : 'Tryck på en symbol för att styra den') : tre ? 'Dra för att vrida · nyp för att zooma · dubbeltryck på ett rum' : 'Dra för att flytta ritningen';
  const rr = RR ? roomStats(s, RR.id) : null;

  return (
    <div ref={stageRef} className={'stage' + (dragging ? ' is-dragging' : '')} onPointerDown={onDown} onWheel={onWheel}>
      <div className="stage-fit" style={{ transform: `translate(-50%, -50%) scale(${fit})` }}>
        <div className="persp">
          <div className="plan" style={{ transform: planTransform }}>
            {rooms.map((r) => (
              <div key={r.id} className="rum" style={roomStyle(r)} onClick={() => tapRoom(r.id)}
                role="button" tabIndex={RR && r.id !== RR.id ? -1 : 0} aria-label={`${r.name}, ${roomInfo(r)}`}
                onKeyDown={(e) => { if (e.key === 'Enter') { onRoom(r.id); onRsel(r.id); } else if (e.key === ' ') { e.preventDefault(); onRsel(r.id); } }}>
                <span className="rum-namn">{r.name}</span>
                <span className="rum-info">{roomInfo(r)}</span>
              </div>
            ))}
            {walls.map((w, i) => <span key={i} aria-hidden="true" className="glas" style={w} />)}
            {WINDOWS[view.floor].map(([x, y, w, h], i) => <span key={i} aria-hidden="true" className="win" style={{ left: x, top: y, width: w, height: h }} />)}
            {pins.map((p) => {
              const look = pinLook(p);
              const vald = sel === p.id;
              return (
                <button key={p.id} className={'pin' + (look.warn ? ' pin-warn' : '')} data-ui aria-pressed={vald} aria-label={`${p.name}, ${roomById(p.room)?.name}`}
                  onClick={() => { if (wasDragged.current) return; onSel(vald ? null : p.id); onRsel(null); }}
                  style={{ left: p.x - 22, top: p.y - 22, transform: (tre ? `rotateZ(${-cam.rz}deg) rotateX(${-cam.rx}deg) translateY(-12px) ` : '') + `scale(${pinScale.toFixed(3)})` }}>
                  <span className="pin-dot" style={{ background: look.bg, color: look.fg, boxShadow: vald ? '0 0 0 3px #18191B, 0 0 0 4.5px var(--acc)' : look.shadow }}>
                    <Icon name={p.kind} size={14} stroke={1.7} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="zoomknappar" data-ui>
        <button className="glasknapp" onClick={() => zoomBy(0.15)} aria-label="Zooma in"><Icon name="plus" size={18} /></button>
        <button className="glasknapp" onClick={() => zoomBy(-0.15)} aria-label="Zooma ut"><Icon name="minus" size={18} /></button>
        <button className="glasknapp" onClick={reset} aria-label="Återställ vyn"><Icon name="reset" size={16} stroke={1.6} /></button>
      </div>

      {RR && rr && (
        <div className="rumhuvud" data-ui>
          <button className="tillbaka-glas tryck" onClick={() => { onRoom(null); }}>
            <Icon name="back" size={16} stroke={2} />Hela huset
          </button>
          <span className="rumhuvud-titel">{RR.name}</span>
          <span className="rumhuvud-sub">{[rr.temp, rr.lamps.length ? `${rr.lit} av ${rr.lamps.length} lampor tända` : null, `${rr.dv.length} enheter`].filter(Boolean).join(' · ')}</span>
        </div>
      )}

      <span className="draghint">{hint}</span>
    </div>
  );
}

function glassWalls(r: Room): React.CSSProperties[] {
  const H = 64;
  const g = 'rgba(255,255,255,';
  return [
    { left: r.x, top: r.y, width: r.w, height: H, transformOrigin: '50% 0', transform: 'rotateX(90deg)', background: `linear-gradient(180deg, ${g}0.16), ${g}0.02))` },
    { left: r.x, top: r.y, width: H, height: r.h, transformOrigin: '0 50%', transform: 'rotateY(-90deg)', background: `linear-gradient(90deg, ${g}0.13), ${g}0.02))` },
    { left: r.x, top: r.y + r.h - H, width: r.w, height: H, transformOrigin: '50% 100%', transform: 'rotateX(-90deg)', opacity: 0.45, background: `linear-gradient(0deg, ${g}0.10), ${g}0.01))` },
    { left: r.x + r.w - H, top: r.y, width: H, height: r.h, transformOrigin: '100% 50%', transform: 'rotateY(90deg)', opacity: 0.45, background: `linear-gradient(270deg, ${g}0.10), ${g}0.01))` },
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
