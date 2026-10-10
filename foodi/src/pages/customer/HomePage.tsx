import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LocateFixed, Search, SlidersHorizontal, X } from 'lucide-react';
import { CUISINES } from '../../data/restaurants';
import { dismiss, isActive, useAppState } from '../../store/store';
import { useLocationPoint, useNow } from '../../store/hooks';
import { discover, EMPTY_FILTERS, type DiscoveryFilters } from '../../store/discovery';
import { Logo } from '../../components/Logo';
import { LocationButton, LocationSheet } from '../../components/Location';
import { ActiveOrderBanner, RestaurantCard } from '../../components/Cards';
import { CUISINE_ICONS } from '../../components/cuisineIcons';
import { plural } from '../../lib/format';
import { photoSrc } from '../../data/photos';

type QuickFilter = 'openNow' | 'fast' | 'topRated' | 'budget';

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: 'openNow', label: 'Öppet nu' },
  { id: 'fast', label: 'Klar inom 10 min' },
  { id: 'topRated', label: 'Betyg 4,5+' },
  { id: 'budget', label: 'Prisvärt' },
];

export function HomePage() {
  const { restaurants, orders, locationChosen, dismissed } = useAppState();
  const point = useLocationPoint();
  const now = useNow(30_000);
  const [cuisine, setCuisine] = useState<DiscoveryFilters['cuisine']>('alla');
  const [quick, setQuick] = useState<QuickFilter[]>([]);
  const [locationOpen, setLocationOpen] = useState(false);

  const filters: DiscoveryFilters = {
    ...EMPTY_FILTERS,
    cuisine,
    openNow: quick.includes('openNow'),
    maxPrep: quick.includes('fast') ? 10 : null,
    minRating: quick.includes('topRated') ? 4.5 : null,
    prices: quick.includes('budget') ? [1] : [],
  };
  const results = discover(restaurants, point, now, filters);
  const fastest = useMemo(
    () =>
      discover(restaurants, point, now, { ...EMPTY_FILTERS, openNow: true, sort: 'fastest' })
        .filter((r) => r.meters < 6000)
        .slice(0, 6),
    [restaurants, point, now],
  );
  const activeOrders = orders.filter((o) => o.origin === 'customer' && isActive(o));
  const browsing = cuisine === 'alla' && quick.length === 0;

  const toggleQuick = (id: QuickFilter) => setQuick((q) => (q.includes(id) ? q.filter((x) => x !== id) : [...q, id]));

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__sun" aria-hidden="true" />
        <div className="home-hero__art" aria-hidden="true">
          <img src={photoSrc('burger-hero')} alt="" />
          <img src={photoSrc('kottbullar')} alt="" />
          <img src={photoSrc('thai-noodles')} alt="" />
        </div>
        <div className="page-width home-hero__inner">
          <div className="home-hero__top">
            <Logo size={34} />
            <LocationButton />
          </div>
          <h1 className="home-hero__title">Vad blir det idag?</h1>
          <p className="home-hero__lead">Beställ i förväg och hämta utan att köa. Du ser exakt när maten är klar.</p>
          <div className="home-hero__search">
            <Link to="/sok" className="search-field">
              <Search size={20} aria-hidden="true" />
              <span>Sök restaurang, kök eller rätt …</span>
            </Link>
            <Link to="/sok?filter=1" className="icon-btn home-hero__filter" aria-label="Filter och sortering">
              <SlidersHorizontal size={20} />
            </Link>
          </div>
        </div>
      </section>

      <div className="page-width home__content">
        {activeOrders.length > 0 && (
          <div className="home__banners">
            {activeOrders.map((order) => {
              const r = restaurants.find((x) => x.id === order.restaurantId);
              return r ? <ActiveOrderBanner key={order.id} order={order} restaurant={r} /> : null;
            })}
          </div>
        )}

        {!locationChosen && !dismissed.includes('location-hint') && (
          <div className="location-hint">
            <span className="location-hint__icon">
              <LocateFixed size={20} />
            </span>
            <p>
              Vi visar restauranger nära <strong>{point.label}</strong>. Använd din plats för att se vad du hinner gå till.
            </p>
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setLocationOpen(true)}>
              Välj plats
            </button>
            <button type="button" className="icon-btn icon-btn--plain icon-btn--sm" onClick={() => dismiss('location-hint')} aria-label="Dölj tipset">
              <X size={18} />
            </button>
            <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
          </div>
        )}

        <div className="chip-row cuisine-row" role="group" aria-label="Kök">
          {CUISINES.map((c) => {
            const Icon = CUISINE_ICONS[c.id];
            return (
              <button
                key={c.id}
                type="button"
                className="chip chip--lime"
                aria-pressed={cuisine === c.id}
                onClick={() => setCuisine(c.id)}
              >
                <Icon size={18} aria-hidden="true" />
                {c.label}
              </button>
            );
          })}
        </div>

        {browsing && fastest.length > 0 && (
          <section className="home-section" aria-labelledby="fastest-title">
            <div className="section-head">
              <h2 id="fastest-title">Klart snabbast just nu</h2>
              <p className="muted">Beställ nu, hämta om en kvart</p>
            </div>
            <div className="carousel">
              {fastest.map((r) => (
                <RestaurantCard key={r.restaurant.id} restaurant={r.restaurant} meters={r.meters} now={now} variant="compact" />
              ))}
            </div>
          </section>
        )}

        <section className="home-section" aria-labelledby="nearby-title">
          <div className="section-head section-head--row">
            <div>
              <h2 id="nearby-title">Restauranger nära {point.label.replace(/^Nära /, '')}</h2>
              <p className="muted">{plural(results.length, 'restaurang', 'restauranger')} · öppna först, sedan närmast</p>
            </div>
          </div>
          <div className="chip-row quick-row" role="group" aria-label="Snabbfilter">
            {QUICK_FILTERS.map((f) => (
              <button key={f.id} type="button" className="chip" aria-pressed={quick.includes(f.id)} onClick={() => toggleQuick(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {results.length > 0 ? (
            <div className="r-grid">
              {results.map((r) => (
                <RestaurantCard key={r.restaurant.id} restaurant={r.restaurant} meters={r.meters} now={now} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty__art" aria-hidden="true">
                🍽️
              </div>
              <h2>Inga restauranger matchar</h2>
              <p>Prova att ta bort ett filter eller välja ett annat kök.</p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  setCuisine('alla');
                  setQuick([]);
                }}
              >
                Visa alla restauranger
              </button>
            </div>
          )}
        </section>

        <section className="how" aria-labelledby="how-title">
          <h2 id="how-title">Så funkar Foodi</h2>
          <ol className="how__steps">
            <li>
              <strong>Beställ</strong>
              <span>Välj rätter och när du vill hämta. Inget konto behövs.</span>
            </li>
            <li>
              <strong>Betala</strong>
              <span>Med Swish, kort eller mobilplånbok. Du ser hela priset innan.</span>
            </li>
            <li>
              <strong>Hämta</strong>
              <span>Vi meddelar när maten är klar. Visa ordernumret vid disken.</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
