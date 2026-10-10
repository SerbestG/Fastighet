import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, Percent, ReceiptText, Store, Users } from 'lucide-react';
import { isActive, useAppState } from '../../store/store';
import { useNow } from '../../store/hooks';
import { clock, dayLabel, kr, minutesAgo, num, shortDate, weekdayShort } from '../../lib/format';
import { addDays, startOfDay } from '../../lib/time';
import { Logo } from '../../components/Logo';
import { orderStatusText } from '../../components/Cards';
import { AdminCustomers, AdminFees, AdminOrders, AdminRestaurants } from './AdminPages';
import { compactKr, dailySeries, inRange, restaurantStats, totals, useAllOrders, type DayPoint } from './adminData';

const NAV = [
  { to: '/admin', label: 'Översikt', icon: LayoutDashboard, end: true },
  { to: '/admin/restauranger', label: 'Restauranger', icon: Store },
  { to: '/admin/bestallningar', label: 'Beställningar', icon: ReceiptText },
  { to: '/admin/kunder', label: 'Kunder', icon: Users },
  { to: '/admin/avgifter', label: 'Avgifter', icon: Percent },
];

export function AdminApp() {
  return (
    <div className="admin">
      <aside className="admin-nav">
        <div className="admin-nav__brand">
          <Link to="/admin" aria-label="Adminöversikt">
            <Logo size={24} />
          </Link>
          <span className="staff-top__tag">admin</span>
        </div>
        <nav aria-label="Admin">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="admin-nav__item">
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="admin-nav__exit">
          <ArrowLeft size={16} aria-hidden="true" /> Till kundvyn
        </Link>
      </aside>
      <main className="admin-main">
        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="restauranger" element={<AdminRestaurants />} />
          <Route path="bestallningar" element={<AdminOrders />} />
          <Route path="kunder" element={<AdminCustomers />} />
          <Route path="avgifter" element={<AdminFees />} />
        </Routes>
      </main>
    </div>
  );
}

function Delta({ current, previous, suffix = 'mot samma tid förra veckan' }: { current: number; previous: number; suffix?: string }) {
  if (previous <= 0) return <span className="delta">{suffix}</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const tone = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
  return (
    <span className={`delta delta--${tone}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '•'} {pct > 0 ? '+' : ''}
      {pct} % <span className="delta__suffix">{suffix}</span>
    </span>
  );
}

function AdminOverview() {
  const now = useNow(30_000);
  const { restaurants, orders: liveOrders } = useAppState();
  const all = useAllOrders(now);
  const today = startOfDay(now);
  const weekAgo = addDays(today, -7);
  const t = totals(inRange(all, today, now + 1));
  const lastWeek = totals(inRange(all, weekAgo, weekAgo + (now - today)));
  const series = dailySeries(all, now, 14);
  const top = restaurantStats(all, restaurants, addDays(today, -29));
  const active = liveOrders.filter(isActive).sort((a, b) => b.createdAt - a.createdAt);
  const openNow = restaurants.filter((r) => !r.suspended).length;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Översikt</h1>
          <p className="muted">
            {dayLabel(now, now)} {shortDate(now)} · uppdaterad {clock(now)} · exempeldata plus beställningar från den här webbläsaren
          </p>
        </div>
      </header>

      <section className="kpis" aria-label="Nyckeltal idag">
        <div className="kpi">
          <span className="kpi__label">Beställningar idag</span>
          <span className="kpi__value">{num(t.orders)}</span>
          <Delta current={t.orders} previous={lastWeek.orders} />
        </div>
        <div className="kpi">
          <span className="kpi__label">Ordervärde idag</span>
          <span className="kpi__value">{compactKr(t.value)}</span>
          <Delta current={t.value} previous={lastWeek.value} />
        </div>
        <div className="kpi kpi--accent">
          <span className="kpi__label">Foodis intäkter idag</span>
          <span className="kpi__value">{compactKr(t.revenue)}</span>
          <span className="delta">provision + serviceavgifter</span>
        </div>
        <div className="kpi">
          <span className="kpi__label">Snittorder</span>
          <span className="kpi__value">{kr(t.average)}</span>
          <span className="delta">
            {openNow} aktiva restauranger · {active.length} pågående ordrar
          </span>
        </div>
      </section>

      <div className="admin-grid">
        <section className="panel admin-card admin-card--chart" aria-labelledby="chart-title">
          <OrdersChart series={series} now={now} />
        </section>

        <section className="panel admin-card" aria-labelledby="live-title">
          <h2 id="live-title">Pågående just nu</h2>
          {active.length === 0 ? (
            <p className="muted">Inga pågående beställningar.</p>
          ) : (
            <ul className="live-list">
              {active.slice(0, 8).map((o) => {
                const r = restaurants.find((x) => x.id === o.restaurantId);
                return (
                  <li key={o.id}>
                    <span className={`pill ${o.status === 'placed' ? 'pill--amber' : o.status === 'ready' ? 'pill--lime' : 'pill--green'}`}>
                      {orderStatusText(o)}
                    </span>
                    <span className="live-list__text">
                      <strong>
                        {o.number} · {r?.name}
                      </strong>
                      <span className="muted">
                        {o.customer.name} · {kr(o.total)} · {minutesAgo(o.createdAt, now)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="panel admin-card" aria-labelledby="top-title">
        <div className="admin-card__head">
          <h2 id="top-title">Restauranger senaste 30 dagarna</h2>
          <Link to="/admin/restauranger" className="btn btn--sm btn--outline">
            Hantera restauranger
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Restaurang</th>
                <th className="num">Ordrar</th>
                <th className="num">Ordervärde</th>
                <th className="num">Provision</th>
                <th className="num">Betyg</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s) => (
                <tr key={s.restaurant.id}>
                  <td className="strong">{s.restaurant.name}</td>
                  <td className="num tabular">{num(s.orders)}</td>
                  <td className="num tabular">{kr(s.value)}</td>
                  <td className="num tabular">{kr(s.commission)}</td>
                  <td className="num tabular">{s.rating.toFixed(1).replace('.', ',')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Stapeldiagram över beställningar per dag, med verktygstips och tabellvy. */
function OrdersChart({ series, now }: { series: DayPoint[]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(640);
  // Ritytan följer behållarens bredd så att texten behåller sin storlek på mobilen.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setMeasured(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [asTable]);
  const width = Math.max(300, measured);
  const height = 240;
  const pad = { top: 16, right: 8, bottom: 30, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(10, ...series.map((d) => d.orders));
  const step = max > 200 ? 100 : max > 80 ? 50 : max > 40 ? 20 : 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const band = innerW / series.length;
  const barW = Math.min(24, band - 6);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const todayIndex = series.length - 1;
  const total = series.reduce((s, d) => s + d.orders, 0);
  const active = hover !== null ? series[hover] : null;

  return (
    <>
      <div className="admin-card__head">
        <div>
          <h2 id="chart-title">Beställningar per dag</h2>
          <p className="muted">Senaste 14 dagarna · {num(total)} totalt · idag till och med {clock(now)}</p>
        </div>
        <button type="button" className="btn btn--sm btn--outline" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Visa diagram' : 'Visa tabell'}
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Dag</th>
                <th className="num">Beställningar</th>
                <th className="num">Ordervärde</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((d) => (
                <tr key={d.dayStart}>
                  <td>
                    {weekdayShort(d.dayStart)} {shortDate(d.dayStart)}
                  </td>
                  <td className="num tabular">{num(d.orders)}</td>
                  <td className="num tabular">{kr(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" ref={boxRef}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Stapeldiagram: beställningar per dag, totalt ${total} på 14 dagar`}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="chart__grid" />
                <text x={pad.left - 8} y={y(v)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
                  {v}
                </text>
              </g>
            ))}
            {series.map((d, i) => {
              const x = pad.left + band * i + (band - barW) / 2;
              const h = Math.max(0, y(0) - y(d.orders));
              const r = Math.min(4, h);
              const path =
                h > 0
                  ? `M${x},${y(0)} V${y(d.orders) + r} Q${x},${y(d.orders)} ${x + r},${y(d.orders)} H${x + barW - r} Q${x + barW},${y(d.orders)} ${x + barW},${y(d.orders) + r} V${y(0)} Z`
                  : '';
              const weekend = [0, 6].includes(new Date(d.dayStart).getDay());
              return (
                <g key={d.dayStart}>
                  {path && <path d={path} className={`chart__bar${i === todayIndex ? ' is-today' : ''}${hover === i ? ' is-hover' : ''}`} />}
                  {(i === todayIndex || (width > 480 ? i % 2 === 1 : i % 3 === 1 && i < todayIndex - 1)) && (
                    <text x={x + barW / 2} y={height - 10} className={`chart__tick${weekend ? ' is-weekend' : ''}`} textAnchor="middle">
                      {i === todayIndex ? 'Idag' : `${new Date(d.dayStart).getDate()}/${new Date(d.dayStart).getMonth() + 1}`}
                    </text>
                  )}
                  {i === todayIndex && h > 0 && (
                    <text x={x + barW / 2} y={y(d.orders) - 6} className="chart__value" textAnchor="middle">
                      {d.orders}
                    </text>
                  )}
                  <rect
                    x={pad.left + band * i}
                    y={pad.top}
                    width={band}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setHover(hover === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>
          {active && hover !== null && (
            <div className="chart__tip" style={{ left: `${((pad.left + band * hover + band / 2) / width) * 100}%` }} role="status">
              <strong>
                {weekdayShort(active.dayStart)} {shortDate(active.dayStart)}
                {hover === todayIndex ? ' (pågår)' : ''}
              </strong>
              <span>{num(active.orders)} beställningar</span>
              <span>{kr(active.value)} i ordervärde</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
