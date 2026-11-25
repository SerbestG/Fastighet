import { useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type SliderLook = 'light' | 'heat' | 'charge' | 'plain';

interface Props {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  look: SliderLook;
  /** Lampans färg (rgb + hex) för ljusreglaget. */
  tone?: { rgb: string; hex: string };
  icon: IconName;
  label: string;
  valueText: string;
}

const heatRgb = (v: number) => (v >= 24 ? '255,138,76' : v >= 21.5 ? '255,180,110' : v >= 19.5 ? '255,215,160' : '120,175,255');

/**
 * Brett dragreglage som glöder i sin färg. Dra var som helst på det –
 * värdet följer fingret från där du började (inget hopp), ett kort tryck
 * hoppar till platsen.
 */
export function GlowSlider({ value, min, max, step, onChange, look, tone, icon, label, valueText }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean; id: number } | null>(null);
  const [active, setActive] = useState(false);
  const last = useRef(value);
  const f = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const snap = (v: number) => {
    const x = Math.max(min, Math.min(max, Math.round((v - min) / step) * step + min));
    return +x.toFixed(step < 1 ? 1 : 0);
  };
  const emit = (v: number) => {
    const s = snap(v);
    if (s === last.current) return;
    // Liten vibration i steg (Android). iOS saknar stöd och ignorerar det.
    const tick = look === 'heat' ? step : (max - min) / 10;
    if (Math.floor(s / tick) !== Math.floor(last.current / tick)) navigator.vibrate?.(3);
    last.current = s;
    onChange(s);
  };
  const width = () => ref.current?.getBoundingClientRect().width ?? 300;

  const down = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* äldre webbläsare */ }
    drag.current = { x: e.clientX, v: value, moved: false, id: e.pointerId };
    last.current = value;
    setActive(true);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    emit(d.v + (dx / width()) * (max - min));
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      const r = ref.current!.getBoundingClientRect();
      emit(min + ((e.clientX - r.left) / r.width) * (max - min));
    }
    drag.current = null;
    setActive(false);
  };
  const key = (e: React.KeyboardEvent) => {
    const big = look === 'heat' ? step : 5;
    const map: Record<string, number> = { ArrowRight: big, ArrowUp: big, ArrowLeft: -big, ArrowDown: -big, PageUp: big * 4, PageDown: -big * 4 };
    if (e.key === 'Home') { e.preventDefault(); emit(min); return; }
    if (e.key === 'End') { e.preventDefault(); emit(max); return; }
    if (map[e.key] === undefined) return;
    e.preventDefault();
    last.current = value;
    emit(value + map[e.key]);
  };

  let fill = 'linear-gradient(90deg, rgba(255,255,255,0.25), #FFFFFF)';
  let glow = 'none';
  if (look === 'light' && tone) {
    fill = `linear-gradient(90deg, rgba(${tone.rgb},0.35), ${tone.hex})`;
    if (value > 0) glow = `0 0 ${Math.round(18 + f * 22)}px rgba(${tone.rgb},${(0.25 + f * 0.3).toFixed(2)})`;
  } else if (look === 'heat') {
    const c = heatRgb(value);
    fill = `linear-gradient(90deg, #6FB6FF, rgb(${c}))`;
    glow = `0 0 26px rgba(${c},0.42)`;
  } else if (look === 'charge') {
    fill = 'linear-gradient(90deg, rgba(44,197,111,0.35), #2CC56F)';
    glow = '0 0 26px rgba(44,197,111,0.45)';
  }

  return (
    <div ref={ref} className={'glow' + (active ? ' is-active' : '')} role="slider" tabIndex={0} aria-label={label}
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      <span className="glow-fill" style={{ width: `${(f * 100).toFixed(1)}%`, background: fill, boxShadow: glow }} />
      <span className="glow-handle" style={{ left: `calc(${(f * 100).toFixed(1)}% - 14px)`, opacity: f > 0.08 ? 1 : 0 }} />
      <span className="glow-icon"><Icon name={icon} size={22} stroke={2} color={f > 0.12 ? '#2A1A08' : '#A4A6AA'} /></span>
      <span className="glow-hint">{active || f > 0.72 ? '' : 'DRA'}</span>
    </div>
  );
}
