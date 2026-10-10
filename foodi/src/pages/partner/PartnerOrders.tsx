import { useMemo, useState } from 'react';
import { AlarmClock, Bot, ChefHat, CircleCheck, MessageSquareWarning, PackageCheck, X } from 'lucide-react';
import type { Order, Restaurant } from '../../types';
import {
  acceptOrder,
  isActive,
  markPickedUp,
  markReady,
  rejectOrder,
  startPreparing,
  updateSettings,
  useAppState,
} from '../../store/store';
import { useNow } from '../../store/hooks';
import { toast } from '../../store/toast';
import { orderHistory } from '../../data/history';
import { clock, inMinutes, kr, minutesAgo, num, phone, plural, when } from '../../lib/format';
import { startOfDay } from '../../lib/time';
import { Sheet } from '../../components/Sheet';
import { PAYMENT_LABEL } from '../customer/PaymentSheet';

type Column = 'new' | 'active' | 'ready';

const REJECT_REASONS = ['Slutsålt', 'Hög belastning i köket', 'Stänger snart', 'Kan inte hålla önskad tid'];

export function PartnerOrders({ restaurant }: { restaurant: Restaurant }) {
  const { orders, settings } = useAppState();
  const now = useNow(5_000);
  const [mobileColumn, setMobileColumn] = useState<Column>('new');
  const [rejecting, setRejecting] = useState<Order | null>(null);

  const mine = orders.filter((o) => o.restaurantId === restaurant.id);
  const active = mine.filter(isActive);
  const columns: Record<Column, Order[]> = {
    new: active.filter((o) => o.status === 'placed').sort((a, b) => a.createdAt - b.createdAt),
    active: active
      .filter((o) => o.status === 'accepted' || o.status === 'preparing')
      .sort((a, b) => (a.confirmedTime ?? a.pickup.time) - (b.confirmedTime ?? b.pickup.time)),
    ready: active.filter((o) => o.status === 'ready').sort((a, b) => a.createdAt - b.createdAt),
  };

  const today = useMemo(() => {
    const start = startOfDay(now);
    const history = orderHistory(now).filter((o) => o.restaurantId === restaurant.id && o.createdAt >= start);
    const live = mine.filter((o) => o.createdAt >= start && !history.some((h) => h.id === o.id));
    const all = [...live, ...history].filter((o) => o.status !== 'rejected' && o.status !== 'cancelled');
    const done = [...live, ...history].filter((o) => !isActive(o)).sort((a, b) => b.createdAt - a.createdAt);
    const revenue = all.reduce((sum, o) => sum + o.subtotal, 0);
    return { count: all.length, revenue, done };
  }, [now, mine, restaurant.id]);

  const columnMeta: { id: Column; title: string; empty: string }[] = [
    { id: 'new', title: 'Nya', empty: 'Inga nya beställningar just nu.' },
    { id: 'active', title: 'Pågående', empty: 'Inget i köket just nu.' },
    { id: 'ready', title: 'Klara att hämta', empty: 'Inget väntar på att hämtas.' },
  ];

  return (
    <div className="board-page">
      <div className="board-stats">
        <div className="stat">
          <span className="stat__label">Ordrar idag</span>
          <span className="stat__value">{num(today.count)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Försäljning idag</span>
          <span className="stat__value">{kr(today.revenue)}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Normal tillagningstid</span>
          <span className="stat__value">{restaurant.prepMinutes} min</span>
        </div>
        <label className="autopilot" htmlFor="autopilot">
          <Bot size={20} aria-hidden="true" />
          <span>
            <strong>Autosvar (demo)</strong>
            <span>Svarar automatiskt på kunders nya beställningar</span>
          </span>
          <span className="switch">
            <input
              id="autopilot"
              type="checkbox"
              checked={settings.autopilot}
              onChange={(e) => {
                updateSettings({ autopilot: e.target.checked });
                toast(e.target.checked ? 'Autosvar är på' : 'Autosvar är av – du styr beställningarna själv');
              }}
            />
            <span className="switch__track" />
          </span>
        </label>
      </div>

      <div className="seg board-seg" role="tablist" aria-label="Kolumn">
        {columnMeta.map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={mobileColumn === c.id} className="seg__item" onClick={() => setMobileColumn(c.id)}>
            {c.title} <span className="seg__sub">{columns[c.id].length}</span>
          </button>
        ))}
      </div>

      <div className="board">
        {columnMeta.map((c) => (
          <section key={c.id} className={`board__col board__col--${c.id}${mobileColumn === c.id ? ' is-visible' : ''}`} aria-labelledby={`col-${c.id}`}>
            <h2 id={`col-${c.id}`} className="board__title">
              {c.title} <span className="count-badge">{columns[c.id].length}</span>
            </h2>
            {columns[c.id].length === 0 ? (
              <p className="board__empty">{c.empty}</p>
            ) : (
              columns[c.id].map((order) => <TicketCard key={order.id} order={order} now={now} onReject={() => setRejecting(order)} />)
            )}
          </section>
        ))}
      </div>

      <section className="done-list" aria-labelledby="done-title">
        <h2 id="done-title">Avslutade idag</h2>
        {today.done.length === 0 ? (
          <p className="muted">Inga avslutade beställningar än idag.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Beställd</th>
                  <th>Kund</th>
                  <th>Rätter</th>
                  <th className="num">Belopp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {today.done.slice(0, 12).map((o) => (
                  <tr key={o.id}>
                    <td className="strong">{o.number}</td>
                    <td className="tabular">{clock(o.createdAt)}</td>
                    <td>{o.customer.name}</td>
                    <td>{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</td>
                    <td className="num tabular">{kr(o.subtotal)}</td>
                    <td>
                      <span className={`pill ${o.status === 'picked_up' ? 'pill--green' : 'pill--red'}`}>
                        {o.status === 'picked_up' ? 'Hämtad' : o.status === 'rejected' ? 'Nekad' : 'Avbruten'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Sheet open={rejecting !== null} onClose={() => setRejecting(null)} title={`Neka ${rejecting?.number ?? ''}`} size="sm">
        <div className="reject">
          <p className="muted">Kunden får ett sms med orsaken och hela beloppet betalas tillbaka automatiskt.</p>
          <div className="reject__reasons">
            {REJECT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className="btn btn--outline btn--block"
                onClick={() => {
                  if (!rejecting) return;
                  rejectOrder(rejecting.id, reason);
                  toast(`${rejecting.number} är nekad och återbetald`);
                  setRejecting(null);
                }}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function TicketCard({ order, now, onReject }: { order: Order; now: number; onReject: () => void }) {
  const requested = order.pickup.time;
  const [offset, setOffset] = useState(0);
  const proposed = requested + offset * 60_000;
  const confirmed = order.confirmedTime ?? requested;
  const late = order.status !== 'ready' && confirmed < now;
  const minutesWaiting = Math.round((now - (order.history.find((h) => h.status === 'ready')?.at ?? now)) / 60_000);

  return (
    <article className={`ticket ticket--${order.status}${late ? ' is-late' : ''}`}>
      <header className="ticket__head">
        <div>
          <span className="ticket__number">{order.number}</span>
          <span className="ticket__customer">
            {order.customer.name} · <span className="tabular">{phone(order.customer.phone)}</span>
          </span>
        </div>
        <span className="ticket__age">{minutesAgo(order.createdAt, now)}</span>
      </header>

      <p className={`ticket__pickup${order.pickup.mode === 'scheduled' ? ' is-scheduled' : ''}`}>
        <AlarmClock size={16} aria-hidden="true" />
        {order.status === 'placed' ? (
          <>
            {order.pickup.mode === 'asap' ? 'Så snart som möjligt' : 'Förbeställd'} · önskar <strong>{when(requested, now)}</strong>
          </>
        ) : order.status === 'ready' ? (
          <>
            Klar sedan {minutesWaiting} min · skulle hämtas <strong>{clock(confirmed)}</strong>
          </>
        ) : (
          <>
            Klar <strong>{when(confirmed, now)}</strong> · {late ? 'försenad' : inMinutes(confirmed, now)}
          </>
        )}
      </p>

      <ul className="ticket__lines">
        {order.lines.map((l, i) => (
          <li key={i}>
            <span className="ticket__qty tabular">{l.quantity}×</span>
            <span>
              <strong>{l.name}</strong>
              {l.modifiers.length > 0 && (
                <span className="ticket__mods">
                  {l.modifiers.map((m) => (
                    <span key={m} className={m.startsWith('Utan') ? 'is-without' : ''}>
                      {m}
                    </span>
                  ))}
                </span>
              )}
              {l.comment && <span className="ticket__comment">”{l.comment}”</span>}
            </span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="ticket__note">
          <MessageSquareWarning size={16} aria-hidden="true" /> {order.note}
        </p>
      )}

      <p className="ticket__paid">
        {plural(order.lines.reduce((n, l) => n + l.quantity, 0), 'rätt', 'rätter')} · <strong className="tabular">{kr(order.subtotal)}</strong> · Betald med{' '}
        {PAYMENT_LABEL[order.payment.method].toLowerCase()}
        {order.origin === 'customer' && order.autopilot && <span className="pill pill--blue">Autosvar</span>}
      </p>

      {order.status === 'placed' && (
        <div className="ticket__accept">
          <div className="time-adjust" role="group" aria-label="Justera hämttid">
            {[-5, 0, 5, 10, 15].map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={offset === m} onClick={() => setOffset(m)}>
                {m === 0 ? 'Önskad' : m > 0 ? `+${m}` : m}
              </button>
            ))}
          </div>
          <div className="ticket__actions">
            <button type="button" className="btn btn--outline" onClick={onReject}>
              <X size={16} aria-hidden="true" /> Neka
            </button>
            <button
              type="button"
              className="btn btn--primary ticket__main"
              onClick={() => {
                acceptOrder(order.id, proposed);
                toast(`${order.number} bekräftad till ${clock(proposed)} · ligger nu under Pågående`, { tone: 'success' });
              }}
            >
              <CircleCheck size={18} aria-hidden="true" /> Bekräfta {clock(proposed)}
            </button>
          </div>
        </div>
      )}

      {order.status === 'accepted' && (
        <div className="ticket__actions">
          <button
            type="button"
            className="btn btn--primary ticket__main"
            onClick={() => {
              startPreparing(order.id);
              toast(`${order.number} lagas nu`);
            }}
          >
            <ChefHat size={18} aria-hidden="true" /> Börja laga
          </button>
        </div>
      )}

      {order.status === 'preparing' && (
        <div className="ticket__actions">
          <button
            type="button"
            className="btn btn--lime ticket__main"
            onClick={() => {
              markReady(order.id);
              toast(`Sms skickat till ${order.customer.name}: maten är klar · ligger under Klara att hämta`, { tone: 'success' });
            }}
          >
            <PackageCheck size={18} aria-hidden="true" /> Klar att hämta
          </button>
        </div>
      )}

      {order.status === 'ready' && (
        <div className="ticket__actions">
          <button
            type="button"
            className="btn btn--primary ticket__main"
            onClick={() => {
              markPickedUp(order.id);
              toast(`${order.number} är hämtad`);
            }}
          >
            <CircleCheck size={18} aria-hidden="true" /> Hämtad av kunden
          </button>
        </div>
      )}
    </article>
  );
}
