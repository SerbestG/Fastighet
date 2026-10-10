import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { CuisineId } from '../../types';
import { CUISINES } from '../../data/restaurants';
import { useAppState } from '../../store/store';
import { useLocationPoint, useNow } from '../../store/hooks';
import { countActiveFilters, discover, EMPTY_FILTERS, type DiscoveryFilters, type SortKey } from '../../store/discovery';
import { RestaurantCard } from '../../components/Cards';
import { DishImage } from '../../components/Media';
import { Sheet } from '../../components/Sheet';
import { CUISINE_ICONS } from '../../components/cuisineIcons';
import { kr, plural, priceLevel } from '../../lib/format';

const POPULAR_SEARCHES = ['Pizza', 'Sushi', 'Köttbullar', 'Kanelbulle', 'Falafel', 'Pho', 'Pad thai', 'Tacos'];

function filtersFromParams(params: URLSearchParams): DiscoveryFilters {
  const prepRaw = params.get('tid');
  const ratingRaw = params.get('betyg');
  return {
    query: params.get('q') ?? '',
    cuisine: (params.get('kok') as CuisineId | null) ?? 'alla',
    prices: (params.get('pris') ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number),
    maxPrep: prepRaw ? Number(prepRaw) : null,
    openNow: params.get('oppet') === '1',
    veg: params.get('veg') === '1',
    minRating: ratingRaw ? Number(ratingRaw) : null,
    sort: (params.get('sort') as SortKey | null) ?? 'distance',
  };
}

function paramsFromFilters(f: DiscoveryFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.query) p.q = f.query;
  if (f.cuisine !== 'alla') p.kok = f.cuisine;
  if (f.prices.length) p.pris = f.prices.join(',');
  if (f.maxPrep !== null) p.tid = String(f.maxPrep);
  if (f.openNow) p.oppet = '1';
  if (f.veg) p.veg = '1';
  if (f.minRating !== null) p.betyg = String(f.minRating);
  if (f.sort !== 'distance') p.sort = f.sort;
  return p;
}

export function SearchPage() {
  const { restaurants } = useAppState();
  const point = useLocationPoint();
  const now = useNow(30_000);
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const [filterOpen, setFilterOpen] = useState(params.get('filter') === '1');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sökfältet får fokus när sidan öppnas, men inte om filtret visas direkt.
  const focusOnOpen = useRef(!filterOpen);
  useEffect(() => {
    if (focusOnOpen.current) inputRef.current?.focus({ preventScroll: true });
  }, []);

  const update = (patch: Partial<DiscoveryFilters>) => setParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });

  const key = params.toString();
  const results = useMemo(() => discover(restaurants, point, now, filtersFromParams(new URLSearchParams(key))), [restaurants, point, now, key]);
  const dishResults = filters.query
    ? results.flatMap((r) => r.dishMatches.map((dish) => ({ dish, restaurant: r.restaurant }))).slice(0, 8)
    : [];
  const activeCount = countActiveFilters(filters);
  const hasQuery = filters.query.trim().length > 0;
  const showLanding = !hasQuery && activeCount === 0;

  return (
    <div className="page-width search-page">
      <h1 className="visually-hidden">Sök</h1>
      <div className="search-bar">
        <form
          className="search-field search-field--input"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            inputRef.current?.blur();
          }}
        >
          <Search size={20} aria-hidden="true" />
          <label htmlFor="search-input" className="visually-hidden">
            Sök restaurang, kök eller rätt
          </label>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Sök restaurang, kök eller rätt …"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
          {hasQuery && (
            <button type="button" className="search-field__clear" onClick={() => update({ query: '' })} aria-label="Rensa sökningen">
              <X size={18} />
            </button>
          )}
        </form>
        <button type="button" className={`btn btn--outline search-bar__filter${activeCount ? ' has-count' : ''}`} onClick={() => setFilterOpen(true)}>
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span className="search-bar__filter-label">Filter</span>
          {activeCount > 0 && <span className="count-badge">{activeCount}</span>}
        </button>
      </div>

      <div className="chip-row cuisine-row" role="group" aria-label="Kök">
        {CUISINES.map((c) => {
          const Icon = CUISINE_ICONS[c.id];
          return (
            <button key={c.id} type="button" className="chip chip--lime" aria-pressed={filters.cuisine === c.id} onClick={() => update({ cuisine: c.id })}>
              <Icon size={18} aria-hidden="true" />
              {c.label}
            </button>
          );
        })}
      </div>

      {showLanding ? (
        <section className="search-landing">
          <h2>Populära sökningar</h2>
          <div className="search-landing__chips">
            {POPULAR_SEARCHES.map((term) => (
              <button key={term} type="button" className="chip" onClick={() => update({ query: term })}>
                <Search size={14} aria-hidden="true" />
                {term}
              </button>
            ))}
          </div>
          <h2>Utforska kök</h2>
          <div className="cuisine-grid">
            {CUISINES.filter((c) => c.id !== 'alla').map((c) => {
              const Icon = CUISINE_ICONS[c.id];
              const count = restaurants.filter((r) => c.id !== 'alla' && r.categories.includes(c.id) && !r.suspended).length;
              return (
                <button key={c.id} type="button" className="cuisine-tile" onClick={() => update({ cuisine: c.id })}>
                  <Icon size={26} aria-hidden="true" />
                  <span className="cuisine-tile__label">{c.label}</span>
                  <span className="cuisine-tile__count">{plural(count, 'ställe', 'ställen')}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <p className="search-page__count" aria-live="polite">
            {plural(results.length, 'restaurang', 'restauranger')}
            {hasQuery ? ` för ”${filters.query}”` : ''}
            {activeCount > 0 && (
              <>
                {' · '}
                <button type="button" className="link-btn" onClick={() => setParams(paramsFromFilters({ ...EMPTY_FILTERS, query: filters.query }), { replace: true })}>
                  Rensa filter
                </button>
              </>
            )}
          </p>

          {dishResults.length > 0 && (
            <section className="dish-results" aria-labelledby="dish-results-title">
              <h2 id="dish-results-title">Rätter</h2>
              <div className="dish-results__list">
                {dishResults.map(({ dish, restaurant }) => (
                  <Link key={`${restaurant.id}-${dish.id}`} to={`/r/${restaurant.id}?ratt=${dish.id}`} className="dish-result">
                    <DishImage dish={dish} brand={restaurant.brand} className="dish-result__img" />
                    <span className="dish-result__body">
                      <strong>{dish.name}</strong>
                      <span className="muted">{restaurant.name}</span>
                    </span>
                    <span className="dish-result__price tabular">{kr(dish.price)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.length > 0 ? (
            <section aria-labelledby="restaurant-results-title">
              <h2 id="restaurant-results-title" className={dishResults.length ? 'search-page__subhead' : 'visually-hidden'}>
                Restauranger
              </h2>
              <div className="r-grid">
                {results.map((r) => (
                  <RestaurantCard key={r.restaurant.id} restaurant={r.restaurant} meters={r.meters} now={now} match={r.match} />
                ))}
              </div>
            </section>
          ) : (
            <div className="empty">
              <div className="empty__art" aria-hidden="true">
                🔎
              </div>
              <h2>Inga träffar</h2>
              <p>Vi hittade inget som matchar. Prova ett annat ord eller färre filter.</p>
              <button type="button" className="btn btn--primary" onClick={() => setParams({}, { replace: true })}>
                Börja om
              </button>
            </div>
          )}
        </>
      )}

      <Sheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter och sortering"
        footer={
          <div className="filter-footer">
            <button type="button" className="btn btn--ghost" onClick={() => setParams(paramsFromFilters({ ...EMPTY_FILTERS, query: filters.query }), { replace: true })}>
              Rensa
            </button>
            <button type="button" className="btn btn--primary btn--lg" onClick={() => setFilterOpen(false)} data-autofocus>
              Visa {plural(results.length, 'restaurang', 'restauranger')}
            </button>
          </div>
        }
      >
        <div className="filters">
          <fieldset className="filters__group">
            <legend>Sortera efter</legend>
            <div className="seg">
              {(
                [
                  ['distance', 'Närmast'],
                  ['fastest', 'Snabbast klar'],
                  ['rating', 'Bäst betyg'],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <button key={key} type="button" className="seg__item" aria-pressed={filters.sort === key} onClick={() => update({ sort: key })}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="filters__group">
            <legend>Upphämtningstid</legend>
            <div className="filters__chips">
              {[null, 10, 15, 20].map((v) => (
                <button key={String(v)} type="button" className="chip" aria-pressed={filters.maxPrep === v} onClick={() => update({ maxPrep: v })}>
                  {v === null ? 'Alla' : `Klar inom ${v} min`}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="filters__group">
            <legend>Prisnivå</legend>
            <div className="filters__chips">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  type="button"
                  className="chip"
                  aria-pressed={filters.prices.includes(level)}
                  onClick={() =>
                    update({ prices: filters.prices.includes(level) ? filters.prices.filter((p) => p !== level) : [...filters.prices, level] })
                  }
                >
                  {priceLevel(level)}
                  <span className="muted filters__chip-note">{level === 1 ? 'Prisvärt' : level === 2 ? 'Mellan' : 'Exklusivt'}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="filters__group">
            <legend>Kök</legend>
            <div className="filters__chips">
              {CUISINES.map((c) => (
                <button key={c.id} type="button" className="chip" aria-pressed={filters.cuisine === c.id} onClick={() => update({ cuisine: c.id })}>
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="filters__toggles">
            <label className="toggle-row" htmlFor="filter-open">
              <span>
                <strong>Öppet nu</strong>
                <span className="muted">Dölj ställen där du bara kan förbeställa</span>
              </span>
              <span className="switch">
                <input id="filter-open" type="checkbox" checked={filters.openNow} onChange={(e) => update({ openNow: e.target.checked })} />
                <span className="switch__track" />
              </span>
            </label>
            <label className="toggle-row" htmlFor="filter-veg">
              <span>
                <strong>Bra vegetariskt utbud</strong>
                <span className="muted">Minst tre vegetariska eller veganska rätter</span>
              </span>
              <span className="switch">
                <input id="filter-veg" type="checkbox" checked={filters.veg} onChange={(e) => update({ veg: e.target.checked })} />
                <span className="switch__track" />
              </span>
            </label>
            <label className="toggle-row" htmlFor="filter-rating">
              <span>
                <strong>Betyg 4,5 eller högre</strong>
                <span className="muted">Baserat på kunders omdömen</span>
              </span>
              <span className="switch">
                <input
                  id="filter-rating"
                  type="checkbox"
                  checked={filters.minRating !== null}
                  onChange={(e) => update({ minRating: e.target.checked ? 4.5 : null })}
                />
                <span className="switch__track" />
              </span>
            </label>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
