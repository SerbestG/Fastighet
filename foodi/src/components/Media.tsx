import type { CSSProperties, ReactNode } from 'react';
import type { Brand, Dish, Restaurant } from '../types';
import { photoSrc } from '../data/photos';

type BrandVars = CSSProperties & Record<'--brand-bg' | '--brand-fg' | '--brand-accent' | '--brand-tile', string>;

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function brandVars(brand: Brand): BrandVars {
  // Mörka märkesfärger blir grå som tonad bakgrund, så då används accentfärgen.
  const tile = luminance(brand.bg) < 0.06 ? brand.accent : brand.bg;
  return { '--brand-bg': brand.bg, '--brand-fg': brand.fg, '--brand-accent': brand.accent, '--brand-tile': tile };
}

/** Foto på rätten, eller en ruta i restaurangens färger om foto saknas. */
export function DishImage({ dish, brand, className = '' }: { dish: Pick<Dish, 'photo' | 'emoji'>; brand: Brand; className?: string }) {
  const src = photoSrc(dish.photo);
  if (src) return <img className={`dish-img ${className}`} src={src} alt="" loading="lazy" decoding="async" />;
  return (
    <div className={`dish-img dish-img--tile ${className}`} style={brandVars(brand)} aria-hidden="true">
      <span>{dish.emoji}</span>
    </div>
  );
}

export function LogoPlate({ brand, size = 'md' }: { brand: Brand; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`logo-plate logo-plate--${brand.font} logo-plate--${size}`} style={brandVars(brand)} aria-hidden="true">
      <span className="logo-plate__primary">{brand.logo.primary}</span>
      {brand.logo.secondary && <span className="logo-plate__secondary">{brand.logo.secondary}</span>}
    </div>
  );
}

/** Omslag med foto när restaurangen har ett, annars ett grafiskt omslag i dess färger. */
export function RestaurantCover({
  restaurant,
  variant,
  children,
  dimmed,
}: {
  restaurant: Restaurant;
  variant: 'card' | 'hero' | 'thumb';
  children?: ReactNode;
  dimmed?: boolean;
}) {
  const { brand, cover } = restaurant;
  const src = photoSrc(cover?.photo);
  return (
    <div
      className={`cover cover--${variant}${src ? ' cover--photo' : ' cover--graphic'}${dimmed ? ' is-dimmed' : ''}`}
      style={brandVars(brand)}
    >
      {src ? (
        <img className="cover__photo" src={src} alt="" style={{ objectPosition: cover?.position }} decoding="async" />
      ) : (
        <div className="cover__motif" aria-hidden="true">
          {brand.motif.map((m, i) => (
            <span key={i} className={`cover__emoji cover__emoji--${i + 1}`}>
              {m}
            </span>
          ))}
        </div>
      )}
      {variant !== 'thumb' && <LogoPlate brand={brand} size={variant === 'hero' ? 'lg' : 'sm'} />}
      {children}
    </div>
  );
}
