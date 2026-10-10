import { Link } from 'react-router-dom';
import { ChevronRight, Clock, Heart, MapPin, Plus } from 'lucide-react';
import type { Dish, Order, Restaurant } from '../types';
import { clock, distance, kr, priceLevel } from '../lib/format';
import { walkingMinutes } from '../lib/geo';
import { toggleFavorite, useAppState } from '../store/store';
import { toast } from '../store/toast';
import { DishImage, RestaurantCover } from './Media';
import { DishTags, Rating } from './Bits';
import { restaurantStatus } from './status';

export function FavoriteButton({ restaurant, className = '' }: { restaurant: Restaurant; className?: string }) {
  const { favorites } = useAppState();
  const active = favorites.includes(restaurant.id);
  return (
    <button
      type="button"
      className={`fav-btn${active ? ' is-active' : ''} ${className}`}
      aria-pressed={active}
      aria-label={active ? `Ta bort ${restaurant.name} från favoriter` : `Spara ${restaurant.name} som favorit`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = toggleFavorite(restaurant.id);
        toast(added ? `${restaurant.name} sparad i favoriter` : `${restaurant.name} borttagen från favoriter`);
      }}
    >
      <Heart size={20} fill={active ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

export function RestaurantCard({
  restaurant,
  meters,
  now,
  match,
  variant = 'grid',
}: {
  restaurant: Restaurant;
  meters: number;
  now: number;
  match?: string;
  variant?: 'grid' | 'compact';
}) {
  const status = restaurantStatus(restaurant, now);
  return (
    <article className={`r-card r-card--${variant}${status.open ? '' : ' is-closed'}`}>
      <Link to={`/r/${restaurant.id}`} className="r-card__link">
        <RestaurantCover restaurant={restaurant} variant="card" dimmed={!status.open}>
          <span className={`r-card__eta${status.open ? '' : ' r-card__eta--closed'}`}>
            {status.open ? (
              <>
                <Clock size={14} aria-hidden="true" /> Klar om {restaurant.prepMinutes} min
              </>
            ) : (
              <>{status.short} · Förbeställ</>
            )}
          </span>
        </RestaurantCover>
        <div className="r-card__body">
          <div className="r-card__title-row">
            <h3 className="r-card__name">{restaurant.name}</h3>
            <Rating value={restaurant.rating} count={restaurant.ratingCount} size="sm" />
          </div>
          <p className="r-card__cuisines">
            {restaurant.cuisines.join(' · ')} <span aria-hidden="true">·</span>{' '}
            <span aria-label={`Prisnivå ${restaurant.priceLevel} av 3`}>{priceLevel(restaurant.priceLevel)}</span>
          </p>
          <p className="r-card__meta">
            <span>
              <MapPin size={14} aria-hidden="true" /> {distance(meters)} · {walkingMinutes(meters)} min promenad
            </span>
            <span className={`r-card__status r-card__status--${status.tone}`}>{status.label}</span>
          </p>
          {match && <p className="r-card__match">Matchar: {match}</p>}
        </div>
      </Link>
      <FavoriteButton restaurant={restaurant} className="r-card__fav" />
    </article>
  );
}

export function DishRow({
  dish,
  restaurant,
  quantityInCart,
  onOpen,
  onQuickAdd,
}: {
  dish: Dish;
  restaurant: Restaurant;
  quantityInCart: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  return (
    <article className={`dish-row${dish.soldOut ? ' is-sold-out' : ''}`}>
      <button type="button" className="dish-row__hit" onClick={onOpen} aria-label={`${dish.name}, ${kr(dish.price)}. Visa detaljer`} />
      <div className="dish-row__media">
        <DishImage dish={dish} brand={restaurant.brand} />
        {quantityInCart > 0 && <span className="dish-row__qty">{quantityInCart}</span>}
      </div>
      <div className="dish-row__body">
        <h3 className="dish-row__name">{dish.name}</h3>
        <p className="dish-row__desc">{dish.description}</p>
        <div className="dish-row__foot">
          <span className="dish-row__price tabular">{kr(dish.price)}</span>
          {dish.soldOut ? <span className="pill pill--red">Slutsåld idag</span> : <DishTags tags={dish.tags} />}
        </div>
      </div>
      <button
        type="button"
        className="add-btn dish-row__add"
        onClick={onQuickAdd}
        disabled={dish.soldOut}
        aria-label={dish.soldOut ? `${dish.name} är slutsåld` : `Lägg till ${dish.name}`}
      >
        <Plus size={20} strokeWidth={2.5} />
      </button>
    </article>
  );
}

export function PopularCard({
  dish,
  restaurant,
  onOpen,
}: {
  dish: Dish;
  restaurant: Restaurant;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={`pop-card${dish.soldOut ? ' is-sold-out' : ''}`} onClick={onOpen}>
      <DishImage dish={dish} brand={restaurant.brand} className="pop-card__img" />
      <span className="pop-card__body">
        <span className="pop-card__name">{dish.name}</span>
        <span className="pop-card__price tabular">{dish.soldOut ? 'Slutsåld' : kr(dish.price)}</span>
      </span>
      <span className="pop-card__add" aria-hidden="true">
        <Plus size={18} strokeWidth={2.5} />
      </span>
    </button>
  );
}

const STATUS_TEXT: Record<Order['status'], string> = {
  placed: 'Väntar på bekräftelse',
  accepted: 'Mottagen',
  preparing: 'Förbereds',
  ready: 'Klar att hämta',
  picked_up: 'Hämtad',
  rejected: 'Nekad',
  cancelled: 'Avbruten',
};

export function orderStatusText(order: Order): string {
  return STATUS_TEXT[order.status];
}

export function ActiveOrderBanner({ order, restaurant }: { order: Order; restaurant: Restaurant }) {
  const time = order.confirmedTime ?? order.pickup.time;
  const ready = order.status === 'ready';
  return (
    <Link to={`/order/${order.id}`} className={`order-banner${ready ? ' is-ready' : ''}`}>
      <span className="order-banner__pulse" aria-hidden="true" />
      <span className="order-banner__text">
        <strong>{ready ? 'Din mat är klar att hämta!' : `${orderStatusText(order)} · ${restaurant.name}`}</strong>
        <span>
          {ready ? `${restaurant.address} · visa ${order.number}` : `Klar ca ${clock(time)} · ${order.number}`}
        </span>
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </Link>
  );
}
