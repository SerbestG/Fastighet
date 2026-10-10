import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Clock, Copy, Info, MapPin, Navigation, ShoppingBag, Store } from 'lucide-react';
import type { Dish, Restaurant } from '../../types';
import { useAppState, setLineQuantity } from '../../store/store';
import { useLocationPoint, useNow, distanceTo } from '../../store/hooks';
import { cartTotals } from '../../store/pricing';
import { toast } from '../../store/toast';
import { clock, distance, kr, plural, priceLevel } from '../../lib/format';
import { directionsUrl, walkingMinutes } from '../../lib/geo';
import { asapTime, formatSpan, openState, weekdayIndex, WEEKDAYS } from '../../lib/time';
import { RestaurantCover } from '../../components/Media';
import { DishRow, FavoriteButton, PopularCard } from '../../components/Cards';
import { QuantityStepper, Rating } from '../../components/Bits';
import { Sheet } from '../../components/Sheet';
import { restaurantStatus } from '../../components/status';
import { useCartAdder } from '../../components/cartAdder';
import { DishSheet } from './DishSheet';

export function RestaurantPage() {
  const { id } = useParams();
  const { restaurants } = useAppState();
  const restaurant = restaurants.find((r) => r.id === id);
  if (!restaurant || restaurant.suspended) {
    return (
      <div className="page-width empty">
        <div className="empty__art" aria-hidden="true">
          🏪
        </div>
        <h1>Restaurangen finns inte</h1>
        <p>Den kan ha tagits bort eller tillfälligt stängts av.</p>
        <Link to="/" className="btn btn--primary">
          Till startsidan
        </Link>
      </div>
    );
  }
  return <RestaurantView restaurant={restaurant} />;
}

function RestaurantView({ restaurant }: { restaurant: Restaurant }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { cart } = useAppState();
  const point = useLocationPoint();
  const now = useNow(30_000);
  const [infoOpen, setInfoOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const { add, dialog } = useCartAdder();

  const status = restaurantStatus(restaurant, now);
  const state = openState(restaurant, now);
  const asap = asapTime(restaurant, now);
  const meters = distanceTo(restaurant, point);
  const popular = restaurant.dishes.filter((d) => d.popular);
  const categories = useMemo(
    () => [
      ...(popular.length > 0 ? [{ id: 'populart', name: 'Populärast' }] : []),
      ...restaurant.menu.filter((c) => restaurant.dishes.some((d) => d.categoryId === c.id)),
    ],
    [restaurant, popular.length],
  );

  const openDishId = params.get('ratt');
  const openDish = restaurant.dishes.find((d) => d.id === openDishId);
  const [lastDish, setLastDish] = useState<Dish | undefined>(openDish);
  useEffect(() => {
    if (openDish) setLastDish(openDish);
  }, [openDish]);

  const openDishSheet = (dish: Dish) => setParams({ ratt: dish.id });
  const closeDishSheet = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else setParams({}, { replace: true });
  };

  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    if (cart?.restaurantId === restaurant.id) for (const l of cart.lines) map[l.dishId] = (map[l.dishId] ?? 0) + l.quantity;
    return map;
  }, [cart, restaurant.id]);

  const quickAdd = (dish: Dish) => {
    if ((dish.optionGroups?.length ?? 0) > 0 || (dish.ingredients?.length ?? 0) > 0) {
      openDishSheet(dish);
      return;
    }
    add(restaurant.id, { dishId: dish.id, quantity: 1, removed: [], selections: {} }, dish.name);
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [restaurant.id]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(entry ? !entry.isIntersecting : false), { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections = categories.map((c) => document.getElementById(`cat-${c.id}`)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0];
        if (first) setActiveCategory(first.target.id.replace('cat-', ''));
      },
      { rootMargin: '-140px 0px -55% 0px' },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    if (nav && chip) nav.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' });
  }, [activeCategory]);

  const jumpTo = (categoryId: string) => {
    document.getElementById(`cat-${categoryId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveCategory(categoryId);
  };

  return (
    <div className="restaurant">
      <div className="restaurant__hero">
        <RestaurantCover restaurant={restaurant} variant="hero">
          <div className="restaurant__hero-actions">
            <button type="button" className="icon-btn" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))} aria-label="Tillbaka">
              <ChevronLeft size={22} />
            </button>
            <FavoriteButton restaurant={restaurant} className="icon-btn" />
          </div>
          <span className={`restaurant__open-pill restaurant__open-pill--${status.tone}`}>
            <span className="dot" aria-hidden="true" />
            {status.short}
          </span>
        </RestaurantCover>
      </div>

      <div className="page-width restaurant__layout">
        <div className="restaurant__main">
          <section className="restaurant__info">
            <div className="restaurant__title-row">
              <h1 className="restaurant__name">{restaurant.name}</h1>
              <button type="button" className="btn btn--outline btn--sm" onClick={() => setInfoOpen(true)}>
                <Info size={16} aria-hidden="true" />
                Info
              </button>
            </div>
            <p className="restaurant__tagline">{restaurant.tagline}</p>
            <p className="restaurant__meta">
              <Rating value={restaurant.rating} count={restaurant.ratingCount} />
              <span aria-hidden="true">·</span>
              <span>{restaurant.cuisines.join(' · ')}</span>
              <span aria-hidden="true">·</span>
              <span>{priceLevel(restaurant.priceLevel)}</span>
            </p>
            <div className="pickup-facts">
              <div className="pickup-fact">
                <Clock size={18} aria-hidden="true" />
                <span>
                  <strong>{asap ? `Klar ca ${clock(asap)}` : 'Förbeställ'}</strong>
                  <span>{asap ? `om ${restaurant.prepMinutes} min om du beställer nu` : status.label}</span>
                </span>
              </div>
              <div className="pickup-fact">
                <Store size={18} aria-hidden="true" />
                <span>
                  <strong>Hämta på {restaurant.address}</strong>
                  <span>
                    {restaurant.area} · {distance(meters)}, {walkingMinutes(meters)} min promenad
                  </span>
                </span>
              </div>
            </div>
            {!state.open && (
              <p className="notice notice--amber restaurant__closed">
                <Clock size={18} aria-hidden="true" />
                <span>
                  <strong>{status.label}.</strong> Du kan beställa redan nu och välja en hämttid när restaurangen har öppnat.
                </span>
              </p>
            )}
          </section>

          <div ref={sentinelRef} className="menu-nav-sentinel" aria-hidden="true" />
          <div className={`menu-nav${stuck ? ' is-stuck' : ''}`}>
            <div className="menu-nav__title" aria-hidden={!stuck}>
              <button
                type="button"
                className="icon-btn icon-btn--plain icon-btn--sm"
                tabIndex={stuck ? 0 : -1}
                onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}
                aria-label="Tillbaka"
              >
                <ChevronLeft size={22} />
              </button>
              <span>{restaurant.name}</span>
            </div>
            <nav ref={navRef} className="chip-row menu-nav__chips" aria-label="Menykategorier">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-cat={c.id}
                  className="chip chip--lime"
                  aria-pressed={activeCategory === c.id}
                  onClick={() => jumpTo(c.id)}
                >
                  {c.name}
                </button>
              ))}
            </nav>
          </div>

          {popular.length > 0 && (
            <section id="cat-populart" className="menu-section" aria-labelledby="title-populart">
              <h2 id="title-populart" className="menu-section__title">
                Populärast
              </h2>
              <div className="pop-row">
                {popular.map((dish) => (
                  <PopularCard key={dish.id} dish={dish} restaurant={restaurant} onOpen={() => openDishSheet(dish)} />
                ))}
              </div>
            </section>
          )}

          {restaurant.menu.map((category) => {
            const dishes = restaurant.dishes.filter((d) => d.categoryId === category.id);
            if (dishes.length === 0) return null;
            return (
              <section key={category.id} id={`cat-${category.id}`} className="menu-section" aria-labelledby={`title-${category.id}`}>
                <h2 id={`title-${category.id}`} className="menu-section__title">
                  {category.name}
                </h2>
                <div className="dish-list">
                  {dishes.map((dish) => (
                    <DishRow
                      key={dish.id}
                      dish={dish}
                      restaurant={restaurant}
                      quantityInCart={quantities[dish.id] ?? 0}
                      onOpen={() => openDishSheet(dish)}
                      onQuickAdd={() => quickAdd(dish)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="restaurant__footnote">
            Priserna gäller vid avhämtning och inkluderar moms. Fråga personalen om allergener.
          </p>
        </div>

        <aside className="restaurant__aside" aria-label="Din beställning">
          <CartPanel restaurant={restaurant} />
        </aside>
      </div>

      <DishSheet restaurant={restaurant} dish={openDish ?? lastDish} open={Boolean(openDish)} onClose={closeDishSheet} />
      <InfoSheet restaurant={restaurant} open={infoOpen} onClose={() => setInfoOpen(false)} now={now} />
      {dialog}
    </div>
  );
}

function CartPanel({ restaurant }: { restaurant: Restaurant }) {
  const { cart, restaurants, settings } = useAppState();
  const cartRestaurant = restaurants.find((r) => r.id === cart?.restaurantId);
  const totals = cartTotals(cart, cartRestaurant, settings);

  if (!cart || totals.lines.length === 0) {
    return (
      <div className="cart-panel cart-panel--empty">
        <span className="cart-panel__icon" aria-hidden="true">
          <ShoppingBag size={26} />
        </span>
        <h2>Din varukorg är tom</h2>
        <p className="muted">Lägg till rätter så ser du priset och kan välja hämttid.</p>
      </div>
    );
  }

  const other = cartRestaurant && cartRestaurant.id !== restaurant.id;
  return (
    <div className="cart-panel">
      <div className="cart-panel__head">
        <h2>Din beställning</h2>
        {other && (
          <p className="muted">
            Från <Link to={`/r/${cartRestaurant.id}`}>{cartRestaurant.name}</Link>
          </p>
        )}
      </div>
      <ul className="cart-panel__lines">
        {totals.lines.map((l) => (
          <li key={l.line.id} className={`cart-panel__line${l.unavailable ? ' is-unavailable' : ''}`}>
            <div className="cart-panel__line-text">
              <strong>{l.dish?.name ?? 'Borttagen rätt'}</strong>
              {l.modifiers.length > 0 && <span className="muted">{l.modifiers.join(', ')}</span>}
              {l.unavailable && <span className="pill pill--red">Slutsåld</span>}
            </div>
            <div className="cart-panel__line-side">
              <span className="tabular">{kr(l.total)}</span>
              <QuantityStepper value={l.line.quantity} min={0} onChange={(v) => setLineQuantity(l.line.id, v)} label={`Antal ${l.dish?.name ?? ''}`} />
            </div>
          </li>
        ))}
      </ul>
      <div className="cart-panel__sum">
        <span>Delsumma</span>
        <span className="tabular">{kr(totals.subtotal)}</span>
      </div>
      <Link to="/kassa" className="btn btn--primary btn--lg btn--block">
        Till kassan
        <span className="btn__meta">{plural(totals.count, 'rätt', 'rätter')}</span>
      </Link>
    </div>
  );
}

function InfoSheet({ restaurant, open, onClose, now }: { restaurant: Restaurant; open: boolean; onClose: () => void; now: number }) {
  const today = weekdayIndex(now);
  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(restaurant.phone);
      toast('Telefonnumret är kopierat', { tone: 'success' });
    } catch {
      toast(`Telefon: ${restaurant.phone}`);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={restaurant.name}>
      <div className="info-sheet">
        <p>{restaurant.about}</p>
        <div className="info-sheet__block">
          <h3>
            <MapPin size={18} aria-hidden="true" /> Hämtas på
          </h3>
          <p>
            {restaurant.address}, {restaurant.area}
          </p>
          <a className="btn btn--lime btn--sm" href={directionsUrl(restaurant.lat, restaurant.lng)} target="_blank" rel="noreferrer">
            <Navigation size={16} aria-hidden="true" />
            Vägbeskrivning
          </a>
        </div>
        <div className="info-sheet__block">
          <h3>
            <Clock size={18} aria-hidden="true" /> Öppettider
          </h3>
          <table className="hours-table">
            <tbody>
              {WEEKDAYS.map((day, i) => (
                <tr key={day} className={i === today ? 'is-today' : ''}>
                  <th scope="row">{day}</th>
                  <td className="tabular">{formatSpan(restaurant.hours[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">Normal tillagningstid: {restaurant.prepMinutes} minuter.</p>
        </div>
        <div className="info-sheet__block">
          <h3>Kontakt</h3>
          <p className="info-sheet__phone">
            <span className="tabular" style={{ userSelect: 'all' }}>
              {restaurant.phone}
            </span>
            <button type="button" className="btn btn--outline btn--sm" onClick={copyPhone}>
              <Copy size={14} aria-hidden="true" /> Kopiera
            </button>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
