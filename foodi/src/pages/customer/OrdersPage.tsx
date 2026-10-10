import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Order } from '../../types';
import { isActive, useAppState } from '../../store/store';
import { useNow } from '../../store/hooks';
import { clock, kr, when } from '../../lib/format';
import { PageHeader } from '../../components/Layout';
import { LogoPlate } from '../../components/Media';
import { orderStatusText } from '../../components/Cards';

export function OrdersPage() {
  const { orders, restaurants } = useAppState();
  const now = useNow(30_000);
  const mine = orders.filter((o) => o.origin === 'customer');
  const active = mine.filter(isActive);
  const past = mine.filter((o) => !isActive(o));

  const row = (order: Order) => {
    const r = restaurants.find((x) => x.id === order.restaurantId);
    if (!r) return null;
    const time = order.confirmedTime ?? order.pickup.time;
    const tone =
      order.status === 'ready' ? 'lime' : isActive(order) ? 'green' : order.status === 'picked_up' ? 'default' : 'red';
    return (
      <li key={order.id}>
        <Link to={`/order/${order.id}`} className="order-row">
          <LogoPlate brand={r.brand} size="sm" />
          <span className="order-row__body">
            <strong>{r.name}</strong>
            <span className="muted">
              {order.number} · {order.lines.reduce((n, l) => n + l.quantity, 0)} rätter · {kr(order.total)}
            </span>
            <span className="muted">{isActive(order) ? `Hämtas ${when(time, now)}` : `Beställd ${when(order.createdAt, now)}`}</span>
          </span>
          <span className={`pill${tone === 'default' ? '' : ` pill--${tone}`}`}>{orderStatusText(order)}</span>
          <ChevronRight size={18} aria-hidden="true" className="order-row__chevron" />
        </Link>
      </li>
    );
  };

  return (
    <div className="page-width narrow-page">
      <PageHeader title="Beställningar" subtitle="Sparas på den här enheten" sticky={false} />
      {mine.length === 0 ? (
        <div className="empty">
          <div className="empty__art" aria-hidden="true">
            🧾
          </div>
          <h2>Inga beställningar än</h2>
          <p>När du beställer ser du status och hämttid här. Du behöver inget konto.</p>
          <Link to="/" className="btn btn--primary">
            Hitta något gott
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="list-section">
              <h2>Pågående</h2>
              <ul className="order-list">{active.map(row)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section className="list-section">
              <h2>Tidigare</h2>
              <ul className="order-list">{past.map(row)}</ul>
            </section>
          )}
          <p className="muted list-footnote">Senast uppdaterad {clock(now)}</p>
        </>
      )}
    </div>
  );
}
