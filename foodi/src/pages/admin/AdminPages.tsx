import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import type { Order, OrderStatus } from '../../types';
import { cancelOrder, isActive, updateRestaurant, updateSettings, useAppState, DEFAULT_SETTINGS } from '../../store/store';
import { useNow } from '../../store/hooks';
import { serviceFee } from '../../store/pricing';
import { toast } from '../../store/toast';
import { normalize } from '../../store/discovery';
import { clock, kr, maskedPhone, num, shortDate, when } from '../../lib/format';
import { addDays, startOfDay } from '../../lib/time';
import { orderStatusText } from '../../components/Cards';
import { restaurantStatus } from '../../components/status';
import { Sheet } from '../../components/Sheet';
import { PAYMENT_LABEL } from '../customer/PaymentSheet';
import { countsAsSale, customerStats, platformRevenue, restaurantStats, useAllOrders } from './adminData';

const STATUS_TONE: Record<OrderStatus, string> = {
  placed: 'pill--amber',
  accepted: 'pill--green',
  preparing: 'pill--green',
  ready: 'pill--lime',
  picked_up: '',
  rejected: 'pill--red',
  cancelled: 'pill--red',
};

// ---------------------------------------------------------------------------
// Restauranger
// ---------------------------------------------------------------------------

export function AdminRestaurants() {
  const now = useNow(30_000);
  const { restaurants } = useAppState();
  const all = useAllOrders(now);
  const stats = restaurantStats(all, restaurants, addDays(startOfDay(now), -29));

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Restauranger</h1>
          <p className="muted">
            {restaurants.length} anslutna i Stockholm · siffror för de senaste 30 dagarna. Provisionen gäller nya beställningar.
          </p>
        </div>
      </header>
      <div className="panel admin-card">
        <div className="table-wrap">
          <table className="table table--interactive">
            <thead>
              <tr>
                <th>Restaurang</th>
                <th>Status</th>
                <th className="num">Ordrar</th>
                <th className="num">Ordervärde</th>
                <th className="num">Betyg</th>
                <th>Provision</th>
                <th>På plattformen</th>
                <th>
                  <span className="visually-hidden">Åtgärder</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ restaurant: r, orders, value }) => {
                const status = restaurantStatus(r, now);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="cell-title">
                        <strong>{r.name}</strong>
                        <span className="muted">
                          {r.address}, {r.area}
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${r.suspended ? 'pill--red' : status.open ? 'pill--green' : status.tone === 'amber' ? 'pill--amber' : ''}`}>
                        {r.suspended ? 'Avstängd' : status.short}
                      </span>
                    </td>
                    <td className="num tabular">{num(orders)}</td>
                    <td className="num tabular">{kr(value)}</td>
                    <td className="num tabular">{r.rating.toFixed(1).replace('.', ',')}</td>
                    <td>
                      <label className="pct-input" htmlFor={`commission-${r.id}`}>
                        <span className="visually-hidden">Provision för {r.name}</span>
                        <input
                          id={`commission-${r.id}`}
                          type="number"
                          min={0}
                          max={40}
                          step={0.5}
                          defaultValue={r.commission}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v) || v < 0 || v > 40) {
                              toast('Provisionen måste vara mellan 0 och 40 %', { tone: 'error' });
                              e.target.value = String(r.commission);
                              return;
                            }
                            if (v !== r.commission) {
                              updateRestaurant(r.id, { commission: v });
                              toast(`Provisionen för ${r.name} är nu ${String(v).replace('.', ',')} %`, { tone: 'success' });
                            }
                          }}
                        />
                        <span>%</span>
                      </label>
                    </td>
                    <td>
                      <label className="stock-toggle" htmlFor={`active-${r.id}`}>
                        <span className="switch">
                          <input
                            id={`active-${r.id}`}
                            type="checkbox"
                            checked={!r.suspended}
                            onChange={(e) => {
                              updateRestaurant(r.id, { suspended: !e.target.checked });
                              toast(e.target.checked ? `${r.name} syns igen för kunderna` : `${r.name} är dold för kunderna`);
                            }}
                          />
                          <span className="switch__track" />
                        </span>
                        <span>{r.suspended ? 'Dold' : 'Synlig'}</span>
                      </label>
                    </td>
                    <td>
                      <Link to={`/partner/${r.id}`} className="btn btn--sm btn--ghost">
                        Restaurangvy <ExternalLink size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beställningar
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { id: 'alla' | 'pagaende' | OrderStatus; label: string }[] = [
  { id: 'alla', label: 'Alla' },
  { id: 'pagaende', label: 'Pågående' },
  { id: 'picked_up', label: 'Hämtade' },
  { id: 'rejected', label: 'Nekade' },
  { id: 'cancelled', label: 'Avbrutna' },
];

export function AdminOrders() {
  const now = useNow(15_000);
  const { restaurants } = useAppState();
  const all = useAllOrders(now);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]['id']>('alla');
  const [restaurantId, setRestaurantId] = useState('alla');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const [selected, setSelected] = useState<Order | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return all.filter((o) => {
      if (status === 'pagaende' && !isActive(o)) return false;
      if (status !== 'alla' && status !== 'pagaende' && o.status !== status) return false;
      if (restaurantId !== 'alla' && o.restaurantId !== restaurantId) return false;
      if (q && !normalize(`${o.number} ${o.customer.name} ${o.customer.phone}`).includes(q)) return false;
      return true;
    });
  }, [all, status, restaurantId, query]);

  const live = selected ? (all.find((o) => o.id === selected.id) ?? selected) : null;
  const restaurantName = (id: string) => restaurants.find((r) => r.id === id)?.name ?? id;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Beställningar</h1>
          <p className="muted">{num(filtered.length)} beställningar de senaste 30 dagarna</p>
        </div>
      </header>
      <div className="admin-filters">
        <div className="chip-row" role="group" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.id} type="button" className="chip" aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="admin-filters__row">
          <label className="search-mini" htmlFor="order-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">Sök order, namn eller telefon</span>
            <input id="order-search" type="search" placeholder="Ordernummer, namn eller telefon" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="visually-hidden" htmlFor="order-restaurant">
            Restaurang
          </label>
          <select id="order-restaurant" className="select select--sm" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
            <option value="alla">Alla restauranger</option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="panel admin-card">
        <div className="table-wrap">
          <table className="table table--interactive">
            <thead>
              <tr>
                <th>Order</th>
                <th>Tid</th>
                <th>Restaurang</th>
                <th>Kund</th>
                <th className="num">Totalt</th>
                <th className="num">Foodi</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((o) => (
                <tr key={o.id} onClick={() => setSelected(o)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(o)}>
                  <td className="strong">
                    {o.number}
                    {o.origin === 'customer' && <span className="pill pill--blue table__tag">Din</span>}
                  </td>
                  <td className="tabular nowrap">{when(o.createdAt, now)}</td>
                  <td>{restaurantName(o.restaurantId)}</td>
                  <td>{o.customer.name}</td>
                  <td className="num tabular">{kr(o.total)}</td>
                  <td className="num tabular">{kr(platformRevenue(o))}</td>
                  <td>
                    <span className={`pill ${STATUS_TONE[o.status]}`}>{orderStatusText(o)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="muted admin-card__empty">Inga beställningar matchar filtret.</p>}
        {filtered.length > limit && (
          <button type="button" className="btn btn--outline btn--block" onClick={() => setLimit((l) => l + 40)}>
            Visa fler ({num(filtered.length - limit)} kvar)
          </button>
        )}
      </div>

      <Sheet open={live !== null} onClose={() => setSelected(null)} title={live ? `Order ${live.number}` : 'Order'}>
        {live && (
          <div className="order-detail">
            <p>
              <span className={`pill ${STATUS_TONE[live.status]}`}>{orderStatusText(live)}</span> {restaurantName(live.restaurantId)}
            </p>
            <dl className="detail-list">
              <div>
                <dt>Kund</dt>
                <dd>
                  {live.customer.name} · {maskedPhone(live.customer.phone)}
                </dd>
              </div>
              <div>
                <dt>Beställd</dt>
                <dd>{when(live.createdAt, now)}</dd>
              </div>
              <div>
                <dt>Hämtning</dt>
                <dd>
                  {live.pickup.mode === 'asap' ? 'Så snart som möjligt' : 'Förbeställd'} · {when(live.confirmedTime ?? live.pickup.time, now)}
                </dd>
              </div>
              <div>
                <dt>Betalning</dt>
                <dd>
                  {PAYMENT_LABEL[live.payment.method]} {live.payment.reference}
                  {live.payment.refundedAt ? ' · återbetald' : ''} (simulerad)
                </dd>
              </div>
            </dl>
            <ul className="order-lines">
              {live.lines.map((l, i) => (
                <li key={i}>
                  <span className="order-lines__qty">{l.quantity}×</span>
                  <span className="order-lines__name">
                    {l.name}
                    {l.modifiers.length > 0 && <span className="muted">{l.modifiers.join(' · ')}</span>}
                  </span>
                  <span className="tabular">{kr(l.unitPrice * l.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="detail-list detail-list--money">
              <div>
                <dt>Matpris</dt>
                <dd className="tabular">{kr(live.subtotal)}</dd>
              </div>
              <div>
                <dt>Serviceavgift (kund)</dt>
                <dd className="tabular">{kr(live.serviceFee)}</dd>
              </div>
              <div>
                <dt>Provision {String(live.commission).replace('.', ',')} % (restaurang)</dt>
                <dd className="tabular">{kr((live.subtotal * live.commission) / 100)}</dd>
              </div>
              <div className="strong">
                <dt>Foodis intäkt</dt>
                <dd className="tabular">{kr(platformRevenue(live))}</dd>
              </div>
              <div>
                <dt>Utbetalas till restaurangen</dt>
                <dd className="tabular">{countsAsSale(live) ? kr(live.subtotal - (live.subtotal * live.commission) / 100) : '0 kr'}</dd>
              </div>
            </dl>
            <h3>Händelser</h3>
            <ol className="timeline">
              {live.history.map((h, i) => (
                <li key={i}>
                  <span className="tabular">{clock(h.at)}</span> {orderStatusText({ ...live, status: h.status })}
                </li>
              ))}
            </ol>
            {isActive(live) && (
              <button
                type="button"
                className="btn btn--danger btn--block"
                onClick={() => {
                  cancelOrder(live.id);
                  toast(`${live.number} är avbruten och återbetald`);
                }}
              >
                Avbryt och återbetala
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kunder
// ---------------------------------------------------------------------------

export function AdminCustomers() {
  const now = useNow(60_000);
  const { restaurants } = useAppState();
  const all = useAllOrders(now);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const customers = useMemo(() => customerStats(all, restaurants), [all, restaurants]);
  const q = normalize(query);
  const filtered = customers.filter((c) => !q || normalize(`${c.name} ${c.phone} ${c.email ?? ''}`).includes(q));
  const returning = customers.filter((c) => c.orders > 1).length;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Kunder</h1>
          <p className="muted">
            {num(customers.length)} kunder de senaste 30 dagarna, varav {num(returning)} har beställt mer än en gång. Gäster utan konto
            identifieras med sitt mobilnummer.
          </p>
        </div>
        <label className="search-mini" htmlFor="customer-search">
          <Search size={16} aria-hidden="true" />
          <span className="visually-hidden">Sök kund</span>
          <input id="customer-search" type="search" placeholder="Namn, telefon eller e-post" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </header>
      <div className="panel admin-card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Kund</th>
                <th>Telefon</th>
                <th className="num">Beställningar</th>
                <th className="num">Totalt</th>
                <th>Senast</th>
                <th>Oftast hos</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((c) => (
                <tr key={c.phone}>
                  <td>
                    <span className="cell-title">
                      <strong>{c.name}</strong>
                      {c.email && <span className="muted">{c.email}</span>}
                    </span>
                  </td>
                  <td className="tabular nowrap">{maskedPhone(c.phone)}</td>
                  <td className="num tabular">{num(c.orders)}</td>
                  <td className="num tabular">{kr(c.spent)}</td>
                  <td className="nowrap">{when(c.lastOrder, now)}</td>
                  <td>{c.favourite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <button type="button" className="btn btn--outline btn--block" onClick={() => setLimit((l) => l + 40)}>
            Visa fler ({num(filtered.length - limit)} kvar)
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avgifter
// ---------------------------------------------------------------------------

export function AdminFees() {
  const now = useNow(60_000);
  const { settings, restaurants } = useAppState();
  const all = useAllOrders(now);
  const [example, setExample] = useState(250);
  const stats = restaurantStats(all, restaurants, addDays(startOfDay(now), -29));
  const fee = serviceFee(example, settings);
  const exampleRestaurant = restaurants[0];
  const commission = ((exampleRestaurant?.commission ?? settings.defaultCommission) * example) / 100;
  const totalFees = all
    .filter((o) => countsAsSale(o) && o.createdAt >= addDays(startOfDay(now), -29))
    .reduce((s, o) => s + o.serviceFee, 0);

  const numberField = (
    id: keyof typeof settings,
    label: string,
    hint: string,
    unit: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={`setting-${id}`}>
        {label}
      </label>
      <span className="unit-input">
        <input
          id={`setting-${id}`}
          className="input"
          type="number"
          min={min}
          max={max}
          step={step}
          value={String(settings[id])}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v >= min && v <= max) updateSettings({ [id]: v });
          }}
        />
        <span>{unit}</span>
      </span>
      <span className="field__hint">{hint}</span>
    </div>
  );

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>Avgifter</h1>
          <p className="muted">Ändringar gäller nya beställningar direkt. Kunderna ser serviceavgiften i kassan innan de betalar.</p>
        </div>
      </header>

      <div className="admin-grid admin-grid--even">
        <section className="panel admin-card" aria-labelledby="fees-title">
          <h2 id="fees-title">Plattformens avgifter</h2>
          <div className="form-grid">
            {numberField('serviceFeePct', 'Serviceavgift för kunden', 'Andel av matpriset', '%', 0, 15, 0.5)}
            {numberField('serviceFeeCap', 'Tak för serviceavgiften', 'Högsta avgift per order', 'kr', 0, 100)}
            {numberField('defaultCommission', 'Standardprovision', 'För nya restauranger', '%', 0, 40, 0.5)}
            {numberField('vatPct', 'Moms på takeaway-mat', 'Tillfälligt 6 % apr 2026–dec 2027', '%', 0, 25)}
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              updateSettings({ ...DEFAULT_SETTINGS, autopilot: settings.autopilot });
              toast('Avgifterna är återställda');
            }}
          >
            Återställ standardvärden
          </button>
        </section>

        <section className="panel admin-card" aria-labelledby="example-title">
          <h2 id="example-title">Räkneexempel</h2>
          <div className="field">
            <label className="field__label" htmlFor="example-amount">
              Matpris i en order
            </label>
            <span className="unit-input">
              <input id="example-amount" className="input" type="number" min={1} max={5000} value={example} onChange={(e) => setExample(Math.max(1, Number(e.target.value) || 0))} />
              <span>kr</span>
            </span>
          </div>
          <dl className="detail-list detail-list--money">
            <div>
              <dt>Kunden betalar</dt>
              <dd className="tabular">{kr(example + fee)}</dd>
            </div>
            <div>
              <dt>varav serviceavgift till Foodi</dt>
              <dd className="tabular">{kr(fee)}</dd>
            </div>
            <div>
              <dt>Provision {exampleRestaurant?.commission ?? settings.defaultCommission} % från restaurangen</dt>
              <dd className="tabular">{kr(commission)}</dd>
            </div>
            <div className="strong">
              <dt>Foodis intäkt</dt>
              <dd className="tabular">{kr(fee + commission)}</dd>
            </div>
            <div>
              <dt>Restaurangen får</dt>
              <dd className="tabular">{kr(example - commission)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel admin-card" aria-labelledby="payout-title">
        <div className="admin-card__head">
          <div>
            <h2 id="payout-title">Utbetalningar senaste 30 dagarna</h2>
            <p className="muted">Serviceavgifter från kunder under perioden: {kr(totalFees)}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Restaurang</th>
                <th className="num">Ordervärde</th>
                <th className="num">Provision</th>
                <th className="num">Utbetalas</th>
                <th>Nästa utbetalning</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.restaurant.id}>
                  <td className="strong">{s.restaurant.name}</td>
                  <td className="num tabular">{kr(s.value)}</td>
                  <td className="num tabular">{kr(s.commission)}</td>
                  <td className="num tabular">{kr(s.value - s.commission)}</td>
                  <td>{shortDate(nextMonday(now))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function nextMonday(now: number): number {
  const d = new Date(startOfDay(now));
  const add = (8 - d.getDay()) % 7 || 7;
  return addDays(d.getTime(), add);
}
