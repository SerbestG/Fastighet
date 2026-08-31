import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { ApiError } from '../lib/api.js';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons.js';

/* -------------------------------------------------------------- knapp --- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  loading,
  icon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`];
  if (size !== 'md') classes.push(`btn-${size}`);
  if (block) classes.push('btn-block');
  return (
    <button className={classes.join(' ')} disabled={disabled || loading} {...props}>
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- fält --- */

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/**
 * Etikett, hjälptext och felmeddelande kopplas till inmatningen med
 * aria-describedby, så att skärmläsare läser upp allt i rätt ordning.
 */
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optional ? <span className="optional"> (frivilligt)</span> : null}
      </label>
      {hint ? (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <span className="error" id={errorId} role="alert">
          <AlertIcon size={16} />
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} className="input" {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea(props, ref) {
    return <textarea ref={ref} className="textarea" {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    return <select ref={ref} className="select" {...props} />;
  },
);

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, description, disabled }: CheckboxProps) {
  return (
    <label className="checkbox" data-checked={checked}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="choice-label">{label}</span>
        {description ? <span className="choice-desc" style={{ display: 'block' }}>{description}</span> : null}
      </span>
    </label>
  );
}

interface RadioGroupProps<T extends string> {
  legend: string;
  value: T | null;
  options: { value: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  name: string;
}

export function RadioGroup<T extends string>({ legend, value, options, onChange, name }: RadioGroupProps<T>) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="stack stack-2">
        {options.map((option) => (
          <label className="radio" key={option.value} data-checked={value === option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <span className="choice-label">{option.label}</span>
              {option.description ? (
                <span className="choice-desc" style={{ display: 'block' }}>{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------- status --- */

export type Tone = 'critical' | 'warning' | 'success' | 'info' | 'neutral';

export function Pill({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) {
  return <span className={`pill pill-${tone}${plain ? ' pill-plain' : ''}`}>{children}</span>;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'critical' | 'warning' | 'info' | 'success';
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Glyph = tone === 'critical' || tone === 'warning' ? AlertIcon : tone === 'success' ? CheckIcon : InfoIcon;
  return (
    <div className={`banner banner-${tone}`} role={tone === 'critical' ? 'alert' : undefined}>
      <Glyph size={20} />
      <div className="grow">
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------- tillstånd --- */

export function Skeleton({ height = '1rem', width = '100%' }: { height?: string; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 3, label = 'Hämtar…' }: { rows?: number; label?: string }) {
  return (
    <div className="stack stack-3" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="card stack stack-2" key={index}>
          <Skeleton height="0.85rem" width="45%" />
          <Skeleton height="0.75rem" width="80%" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="icon">{icon}</div> : null}
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

/**
 * Fellägen visar ett begripligt meddelande, ett spårnings-ID och en möjlighet
 * att försöka igen (avsnitt 26 i kravbilden).
 */
export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <div className="icon">
        <AlertIcon size={24} />
      </div>
      <h3>{error.status === 403 ? 'Du saknar behörighet' : 'Det gick inte att hämta informationen'}</h3>
      <p>{error.message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Försök igen
        </Button>
      ) : null}
      {error.traceId ? <p className="trace">Spårnings-ID: {error.traceId}</p> : null}
    </div>
  );
}

/** Standardhölje som väljer rätt tillstånd: laddar, fel, tomt eller innehåll. */
export function QueryBoundary<T>({
  state,
  empty,
  children,
  loadingRows,
}: {
  state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void };
  empty?: { when: (data: T) => boolean; render: ReactNode };
  children: (data: T) => ReactNode;
  loadingRows?: number;
}) {
  if (state.loading) return <LoadingBlock rows={loadingRows ?? 3} />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  if (empty?.when(state.data)) return <>{empty.render}</>;
  return <>{children(state.data)}</>;
}

/* -------------------------------------------------------------- dialog --- */

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      // Fokus hålls kvar i dialogen så länge den är öppen.
      if (event.key === 'Tab' && ref.current) {
        const focusable = ref.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Stäng">
            <CloseIcon />
          </button>
        </div>
        {children}
        {footer ? <div className="stack stack-2" style={{ marginTop: 'var(--space-5)' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- övrigt --- */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; count?: number }[];
  active: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="tag" style={{ marginLeft: 6 }}>{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="stack stack-3" style={{ margin: 0 }}>
      {items.map((item) => (
        <div className="row-between" key={item.label} style={{ alignItems: 'flex-start', gap: 'var(--space-4)' }}>
          <dt className="muted small" style={{ flex: '0 0 auto' }}>{item.label}</dt>
          <dd className="strong" style={{ margin: 0, textAlign: 'right' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div style={{ width: `${percent}%` }} />
    </div>
  );
}
