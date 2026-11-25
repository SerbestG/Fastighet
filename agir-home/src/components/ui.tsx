import type { ReactNode } from 'react';
import { go } from '../router';
import { Icon } from './Icon';

/** Pill-knappar med glödprick. */
export function Pills<T extends string>({ options, value, onPick, label, wide }: {
  options: { id: T; label: string; dot: string }[];
  value: T | null;
  onPick: (id: T) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={'pills' + (wide ? ' pills-wide' : '')}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} className={'pill tryck' + (on ? ' is-on' : '')} aria-pressed={on} onClick={() => onPick(o.id)}>
            <span className="pill-dot" aria-hidden="true" style={{ background: o.dot, boxShadow: `0 0 8px ${o.dot}` }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Segmentväljare (Entréplan/Övre plan, 2D/3D). */
export function Segment<T extends string>({ options, value, onPick, label }: {
  options: { id: T; label: string }[]; value: T; onPick: (id: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="segment">
      {options.map((o) => (
        <button key={o.id} className={'seg' + (o.id === value ? ' is-on' : '')} aria-pressed={o.id === value} onClick={() => onPick(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Switch({ on, onToggle, label, locked }: { on: boolean; onToggle: () => void; label: string; locked?: boolean }) {
  return (
    <button className={'switch' + (on ? ' is-on' : '')} role="switch" aria-checked={on} aria-label={label} disabled={locked}
      onClick={onToggle}>
      <span />
    </button>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={'chip tryck' + (on ? ' is-on' : '')} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/** Rubrik: "‹ Villa Agir", statusrad, stor vänsterställd rubrik, Agir-knapp. */
export function Header({ title, status, backTo = '/', backLabel = 'Villa Agir', right, statusColor }: {
  title: string; status?: ReactNode; backTo?: string; backLabel?: string; right?: ReactNode; statusColor?: string;
}) {
  return (
    <header className="head">
      <a className="tillbaka" href={backTo} onClick={(e) => { e.preventDefault(); go(backTo, { back: true }); }}>
        <Icon name="back" size={22} stroke={1.5} />{backLabel}
      </a>
      <div className="head-row">
        <div className="head-text">
          {status && <span className="status" style={statusColor ? { color: statusColor, fontWeight: 600 } : undefined}>{status}</span>}
          <h1>{title}</h1>
        </div>
        <div className="head-knappar">
          {right}
          <AgirButton />
        </div>
      </div>
    </header>
  );
}

export function AgirButton() {
  return (
    <a href="/agir" className="agirknapp" aria-label="Fråga Agir" onClick={(e) => { e.preventDefault(); go('/agir'); }}>
      <Icon name="spark" size={18} stroke={1.5} />
    </a>
  );
}

export function RoundLink({ to, label, icon, dot }: { to: string; label: string; icon: Parameters<typeof Icon>[0]['name']; dot?: boolean }) {
  return (
    <a href={to} className="rundknapp" aria-label={label} onClick={(e) => { e.preventDefault(); go(to); }}>
      <Icon name={icon} size={18} stroke={1.5} />
      {dot && <span className="rundknapp-prick" aria-hidden="true" />}
    </a>
  );
}

export function Link({ to, className, style, children, label }: { to: string; className?: string; style?: React.CSSProperties; children: ReactNode; label?: string }) {
  return <a href={to} className={className} style={style} aria-label={label} onClick={(e) => { e.preventDefault(); go(to); }}>{children}</a>;
}

/** Agirs förslag i listskärmar: text + två knappar. */
export function AgirTip({ label, text, yes, no, onYes, onNo }: { label: string; text: string; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="tip in">
      <div className="tip-body">
        <span className="tip-label"><Icon name="spark" size={15} stroke={1.8} />{label}</span>
        <span className="tip-text">{text}</span>
      </div>
      <div className="tip-knappar">
        <button className="tryck" onClick={onYes}>{yes}</button>
        <button className="tryck tip-nej" onClick={onNo}>{no}</button>
      </div>
    </div>
  );
}

export function Done({ children }: { children: ReactNode }) {
  return <div className="klar in" role="status"><Icon name="check" size={18} stroke={2.2} color="#2CC56F" />{children}</div>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="sektion">{children}</span>;
}

export function Row({ label, sub, right, subWarn }: { label: string; sub?: string; right?: ReactNode; subWarn?: boolean }) {
  return (
    <div className="rad">
      <span className="rad-text"><span className="rad-titel">{label}</span>{sub && <span className={'rad-sub' + (subWarn ? ' warn' : '')}>{sub}</span>}</span>
      {right}
    </div>
  );
}
