import { Minus, Plus, Star, Leaf, Flame } from 'lucide-react';
import type { DishTag } from '../types';
import { decimal, num } from '../lib/format';

export function Rating({ value, count, size = 'md' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  return (
    <span className={`rating rating--${size}`} aria-label={`Betyg ${decimal(value)} av 5${count ? `, ${count} omdömen` : ''}`}>
      <Star size={size === 'sm' ? 13 : 15} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      <span className="rating__value">{decimal(value)}</span>
      {count !== undefined && <span className="rating__count">({num(count)})</span>}
    </span>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  label,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'md' | 'lg';
}) {
  return (
    <div className={`stepper stepper--${size}`} role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Minska antal">
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Öka antal">
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

const TAG_LABEL: Record<DishTag, string> = {
  vegetarisk: 'Vegetarisk',
  vegansk: 'Vegansk',
  stark: 'Stark',
  glutenfri: 'Glutenfri',
  laktosfri: 'Laktosfri',
};

export function DishTags({ tags }: { tags?: DishTag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <span className="dish-tags">
      {tags.map((tag) => (
        <span key={tag} className={`tag${tag === 'vegansk' || tag === 'vegetarisk' ? ' tag--veg' : tag === 'stark' ? ' tag--hot' : ''}`}>
          {(tag === 'vegansk' || tag === 'vegetarisk') && <Leaf size={12} aria-hidden="true" />}
          {tag === 'stark' && <Flame size={12} aria-hidden="true" />}
          {TAG_LABEL[tag]}
        </span>
      ))}
    </span>
  );
}

export function SimulatedBadge({ children = 'Simulerat' }: { children?: string }) {
  return <span className="pill pill--amber simulated-badge">{children}</span>;
}
