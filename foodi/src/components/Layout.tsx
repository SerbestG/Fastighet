import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Heart, House, ReceiptText, Search, ShoppingBag, User } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { isActive, useAppState } from '../store/store';
import { cartTotals } from '../store/pricing';
import { kr, plural } from '../lib/format';
import { Logo } from './Logo';
import { LocationButton } from './Location';

export function useCartSummary() {
  const { cart, restaurants, settings } = useAppState();
  const restaurant = restaurants.find((r) => r.id === cart?.restaurantId);
  const totals = cartTotals(cart, restaurant, settings);
  return { cart, restaurant, totals };
}

export function SiteHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { totals, restaurant } = useCartSummary();
  const { orders } = useAppState();
  const activeOrders = orders.filter((o) => o.origin === 'customer' && isActive(o)).length;
  const [query, setQuery] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/sok${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link to="/" className="site-header__logo" aria-label="Foodi – till startsidan">
          <Logo size={30} />
        </Link>
        <LocationButton variant="header" />
        {location.pathname !== '/sok' && location.pathname !== '/' && (
          <form className="site-header__search" role="search" onSubmit={submit}>
            <Search size={18} aria-hidden="true" />
            <label htmlFor="header-search" className="visually-hidden">
              Sök restaurang eller rätt
            </label>
            <input
              id="header-search"
              type="search"
              placeholder="Sök restaurang, kök eller rätt"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        )}
        <nav className="site-header__nav" aria-label="Huvudmeny">
          <NavLink to="/favoriter" className="site-header__link">
            <Heart size={18} aria-hidden="true" />
            Favoriter
          </NavLink>
          <NavLink to="/bestallningar" className="site-header__link">
            <ReceiptText size={18} aria-hidden="true" />
            Beställningar
            {activeOrders > 0 && <span className="badge-dot" aria-label={`${activeOrders} pågående`} />}
          </NavLink>
          <NavLink to="/profil" className="site-header__link">
            <User size={18} aria-hidden="true" />
            Profil
          </NavLink>
        </nav>
        <Link to="/kassa" className={`site-header__cart${totals.count > 0 ? ' has-items' : ''}`} aria-label={`Varukorg, ${plural(totals.count, 'rätt', 'rätter')}`}>
          <ShoppingBag size={20} aria-hidden="true" />
          {totals.count > 0 ? (
            <>
              <span className="site-header__cart-count">{totals.count}</span>
              <span className="site-header__cart-total tabular">{kr(totals.subtotal)}</span>
            </>
          ) : (
            <span>Varukorg</span>
          )}
          {restaurant && totals.count > 0 && <span className="visually-hidden">från {restaurant.name}</span>}
        </Link>
      </div>
    </header>
  );
}

export function TabBar() {
  const { orders } = useAppState();
  const activeOrders = orders.filter((o) => o.origin === 'customer' && isActive(o)).length;
  const items = [
    { to: '/', label: 'Hem', icon: House, end: true },
    { to: '/sok', label: 'Sök', icon: Search },
    { to: '/favoriter', label: 'Favoriter', icon: Heart },
    { to: '/bestallningar', label: 'Beställningar', icon: ReceiptText, badge: activeOrders },
    { to: '/profil', label: 'Profil', icon: User },
  ];
  return (
    <nav className="tabbar" aria-label="Huvudmeny">
      {items.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink key={to} to={to} end={end} className="tabbar__item">
          <span className="tabbar__icon">
            <Icon size={22} strokeWidth={2} aria-hidden="true" />
            {badge ? <span className="tabbar__badge">{badge}</span> : null}
          </span>
          <span className="tabbar__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Varukorgen i botten av skärmen på mobilen. */
export function CartBar({ withTabbar }: { withTabbar: boolean }) {
  const { totals, restaurant } = useCartSummary();
  if (totals.count === 0 || !restaurant) return null;
  return (
    <div className={`cart-bar${withTabbar ? ' cart-bar--above-tabs' : ''}`}>
      <Link to="/kassa" className="cart-bar__inner">
        <span className="cart-bar__bag">
          <ShoppingBag size={22} aria-hidden="true" />
          <span className="cart-bar__count">{totals.count}</span>
        </span>
        <span className="cart-bar__text">
          <strong>Din beställning</strong>
          <span>
            {plural(totals.count, 'rätt', 'rätter')} · <span className="tabular">{kr(totals.subtotal)}</span>
          </span>
        </span>
        <span className="cart-bar__cta">
          Visa varukorg <ChevronRight size={18} aria-hidden="true" />
        </span>
      </Link>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  sticky = true,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  sticky?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className={`page-header${sticky ? ' page-header--sticky' : ''}`}>
      {back && (
        <button
          type="button"
          className="icon-btn icon-btn--plain page-header__back"
          onClick={() => (back === true ? (window.history.length > 1 ? navigate(-1) : navigate('/')) : navigate(back))}
          aria-label="Tillbaka"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="page-header__titles">
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}
