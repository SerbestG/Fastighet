import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ClipboardList, Clock, ExternalLink, Pause, Play, Store, UtensilsCrossed } from 'lucide-react';
import type { Restaurant } from '../../types';
import { isActive, updateRestaurant, useAppState } from '../../store/store';
import { useNow } from '../../store/hooks';
import { toast } from '../../store/toast';
import { clock } from '../../lib/format';
import { Logo } from '../../components/Logo';
import { LogoPlate } from '../../components/Media';
import { restaurantStatus } from '../../components/status';
import { PartnerOrders } from './PartnerOrders';
import { PartnerMenu } from './PartnerMenu';
import { PartnerSettings } from './PartnerSettings';

export function PartnerPicker() {
  const { restaurants, orders } = useAppState();
  const now = useNow(30_000);
  return (
    <div className="staff staff--picker">
      <header className="staff-top">
        <div className="staff-top__inner">
          <Link to="/" className="staff-top__brand" aria-label="Till kundvyn">
            <Logo size={24} />
            <span className="staff-top__tag">för restauranger</span>
          </Link>
          <Link to="/" className="btn btn--sm btn--ghost staff-top__exit">
            <ArrowLeft size={16} aria-hidden="true" /> Till kundvyn
          </Link>
        </div>
      </header>
      <main className="staff-page staff-page--narrow">
        <h1 className="staff-title">Välj restaurang</h1>
        <p className="staff-lead">
          I prototypen loggar du in som personal direkt. I en riktig version loggar varje restaurang in med BankID eller e-post och ser
          bara sina egna beställningar.
        </p>
        <ul className="picker-list">
          {restaurants.map((r) => {
            const active = orders.filter((o) => o.restaurantId === r.id && isActive(o));
            const fresh = active.filter((o) => o.status === 'placed').length;
            const status = restaurantStatus(r, now);
            return (
              <li key={r.id}>
                <Link to={`/partner/${r.id}`} className="picker-item">
                  <LogoPlate brand={r.brand} size="sm" />
                  <span className="picker-item__text">
                    <strong>{r.name}</strong>
                    <span className="muted">
                      {r.address}, {r.area}
                    </span>
                    <span className={`picker-item__status picker-item__status--${status.tone}`}>{status.label}</span>
                  </span>
                  {fresh > 0 && <span className="pill pill--red">{fresh} nya</span>}
                  {active.length > 0 && fresh === 0 && <span className="pill">{active.length} pågående</span>}
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}

export function PartnerApp() {
  const { id } = useParams();
  const { restaurants } = useAppState();
  const restaurant = restaurants.find((r) => r.id === id);
  if (!restaurant) {
    return (
      <div className="staff">
        <main className="staff-page empty">
          <h1>Restaurangen finns inte</h1>
          <Link to="/partner" className="btn btn--primary">
            Välj restaurang
          </Link>
        </main>
      </div>
    );
  }
  return <PartnerShell restaurant={restaurant} />;
}

function PartnerShell({ restaurant }: { restaurant: Restaurant }) {
  const { orders } = useAppState();
  const now = useNow(10_000);
  const status = restaurantStatus(restaurant, now);
  const newCount = orders.filter((o) => o.restaurantId === restaurant.id && o.status === 'placed').length;
  const paused = Boolean(restaurant.pausedUntil && restaurant.pausedUntil > now);
  const [pauseOpen, setPauseOpen] = useState(false);
  const previousNew = useRef(newCount);
  const [flash, setFlash] = useState(false);

  // Visuell signal när en ny beställning kommer in.
  useEffect(() => {
    if (newCount > previousNew.current) {
      setFlash(true);
      toast(`Ny beställning till ${restaurant.name}`, { tone: 'success' });
      const id = window.setTimeout(() => setFlash(false), 2400);
      previousNew.current = newCount;
      return () => window.clearTimeout(id);
    }
    previousNew.current = newCount;
  }, [newCount, restaurant.name]);

  useEffect(() => {
    const original = document.title;
    document.title = newCount > 0 ? `(${newCount}) Nya ordrar – ${restaurant.name}` : `${restaurant.name} – Foodi för restauranger`;
    return () => {
      document.title = original;
    };
  }, [newCount, restaurant.name]);

  const pause = (minutes: number) => {
    updateRestaurant(restaurant.id, { pausedUntil: Date.now() + minutes * 60_000 });
    setPauseOpen(false);
    toast(`Beställningar pausade i ${minutes} min`);
  };

  return (
    <div className={`staff${flash ? ' is-flashing' : ''}`}>
      <header className="staff-top">
        <div className="staff-top__inner">
          <Link to="/partner" className="staff-top__brand" aria-label="Byt restaurang">
            <Logo size={22} />
            <span className="staff-top__tag">för restauranger</span>
          </Link>
          <div className="staff-top__place">
            <strong>{restaurant.name}</strong>
            <span className={`staff-top__status staff-top__status--${status.tone}`}>
              <span className="dot" aria-hidden="true" /> {status.label}
            </span>
          </div>
          <div className="staff-top__actions">
            <span className="staff-top__clock tabular" aria-label="Klockan">
              <Clock size={15} aria-hidden="true" /> {clock(now)}
            </span>
            {paused ? (
              <button
                type="button"
                className="btn btn--sm btn--lime"
                onClick={() => {
                  updateRestaurant(restaurant.id, { pausedUntil: undefined });
                  toast('Restaurangen tar emot beställningar igen', { tone: 'success' });
                }}
              >
                <Play size={15} aria-hidden="true" /> Återuppta
              </button>
            ) : (
              <div className="pause-menu">
                <button type="button" className="btn btn--sm staff-top__pause" aria-expanded={pauseOpen} onClick={() => setPauseOpen((v) => !v)}>
                  <Pause size={15} aria-hidden="true" /> Pausa
                </button>
                {pauseOpen && (
                  <div className="pause-menu__list" role="menu">
                    <p>Pausa nya beställningar i</p>
                    {[15, 30, 60].map((m) => (
                      <button key={m} type="button" role="menuitem" onClick={() => pause(m)}>
                        {m} minuter
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <Link to={`/r/${restaurant.id}`} className="btn btn--sm btn--ghost staff-top__exit" title="Visa restaurangen som kund">
              <ExternalLink size={15} aria-hidden="true" />
              <span>Kundvy</span>
            </Link>
          </div>
        </div>
        <nav className="staff-tabs" aria-label="Restaurangvy">
          <NavLink to={`/partner/${restaurant.id}`} end className="staff-tabs__item">
            <ClipboardList size={18} aria-hidden="true" /> Ordrar
            {newCount > 0 && <span className="count-badge count-badge--red">{newCount}</span>}
          </NavLink>
          <NavLink to={`/partner/${restaurant.id}/meny`} className="staff-tabs__item">
            <UtensilsCrossed size={18} aria-hidden="true" /> Meny
          </NavLink>
          <NavLink to={`/partner/${restaurant.id}/oppettider`} className="staff-tabs__item">
            <Store size={18} aria-hidden="true" /> Öppettider & drift
          </NavLink>
        </nav>
      </header>
      <main className="staff-page">
        <Routes>
          <Route index element={<PartnerOrders restaurant={restaurant} />} />
          <Route path="meny" element={<PartnerMenu restaurant={restaurant} />} />
          <Route path="oppettider" element={<PartnerSettings restaurant={restaurant} />} />
        </Routes>
      </main>
    </div>
  );
}
