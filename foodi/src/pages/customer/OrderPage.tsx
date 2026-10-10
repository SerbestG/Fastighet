import { useState, type CSSProperties } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChefHat, Copy, FastForward, Hourglass, Mail, MessageSquareText, Navigation, PackageCheck, ReceiptText, Star, Store, X } from 'lucide-react';
import type { Order, Restaurant } from '../../types';
import { advanceDemo, cancelOrder, markPickedUp, rateOrder, useAppState } from '../../store/store';
import { useNow } from '../../store/hooks';
import { includedVat } from '../../store/pricing';
import { toast } from '../../store/toast';
import { clock, dayLabel, inMinutes, kr, longDate, phone, when } from '../../lib/format';
import { directionsUrl } from '../../lib/geo';
import { LogoPlate } from '../../components/Media';
import { ConfirmDialog, Sheet } from '../../components/Sheet';
import { PageHeader } from '../../components/Layout';
import { PAYMENT_LABEL, walletName } from './PaymentSheet';

const STEPS = [
  { key: 'accepted', label: 'Mottagen', icon: Check },
  { key: 'preparing', label: 'Förbereds', icon: ChefHat },
  { key: 'ready', label: 'Klar att hämta', icon: PackageCheck },
] as const;

function stepIndex(order: Order): number {
  switch (order.status) {
    case 'placed':
      return 0;
    case 'accepted':
      return 1;
    case 'preparing':
      return 2;
    case 'ready':
      return 3;
    case 'picked_up':
      return 4;
    default:
      return -1;
  }
}

function reachedAt(order: Order, status: string): number | undefined {
  return order.history.find((h) => h.status === status)?.at;
}

export function OrderPage() {
  const { id } = useParams();
  const { orders, restaurants } = useAppState();
  const order = orders.find((o) => o.id === id);
  const restaurant = restaurants.find((r) => r.id === order?.restaurantId);
  if (!order || !restaurant) {
    return (
      <div className="page-width">
        <PageHeader title="Beställning" back="/bestallningar" />
        <div className="empty">
          <div className="empty__art" aria-hidden="true">
            🧾
          </div>
          <h2>Vi hittar inte beställningen</h2>
          <p>Beställningar sparas på enheten du beställde från.</p>
          <Link to="/bestallningar" className="btn btn--primary">
            Mina beställningar
          </Link>
        </div>
      </div>
    );
  }
  return <OrderView order={order} restaurant={restaurant} />;
}

function OrderView({ order, restaurant }: { order: Order; restaurant: Restaurant }) {
  const [params] = useSearchParams();
  const now = useNow(1000);
  const { settings } = useAppState();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const fresh = params.get('ny') === '1' && now - order.createdAt < 5 * 60_000;
  const time = order.confirmedTime ?? order.pickup.time;
  const index = stepIndex(order);
  const ended = order.status === 'rejected' || order.status === 'cancelled';
  const firstName = order.customer.name.split(' ')[0];

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(restaurant.phone);
      toast('Telefonnumret är kopierat', { tone: 'success' });
    } catch {
      toast(`Telefon: ${restaurant.phone}`);
    }
  };

  const headline = (() => {
    switch (order.status) {
      case 'placed':
        return { title: 'Väntar på att restaurangen bekräftar', text: 'Det brukar ta någon minut.' };
      case 'accepted':
        return order.pickup.mode === 'scheduled' && time - now > 25 * 60_000
          ? { title: 'Mottagen och inplanerad', text: `Köket börjar laga maten i god tid före ${clock(time)}.` }
          : { title: 'Restaurangen har tagit emot beställningen', text: 'Köket sätter igång alldeles strax.' };
      case 'preparing':
        return { title: 'Köket lagar din mat', text: 'Vi skickar ett sms när den är klar att hämta.' };
      case 'ready':
        return { title: 'Din mat är klar att hämta!', text: `Gå till ${restaurant.address} och visa ordernumret i kassan.` };
      case 'picked_up':
        return { title: 'Hämtad – smaklig måltid!', text: `Hämtad ${when(reachedAt(order, 'picked_up') ?? now, now)}.` };
      case 'rejected':
        return { title: 'Restaurangen kunde inte ta emot beställningen', text: order.rejectReason ?? '' };
      default:
        return { title: 'Beställningen är avbruten', text: 'Hela beloppet betalas tillbaka.' };
    }
  })();

  return (
    <div className="page-width order-page">
      <PageHeader title={`Beställning ${order.number}`} subtitle={restaurant.name} back="/bestallningar" />

      {fresh && (
        <div className="order-success" role="status">
          <span className="order-success__burst" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{ '--r': `${i * 45}deg` } as CSSProperties} />
            ))}
          </span>
          <span className="order-success__check">
            <Check size={34} strokeWidth={3} aria-hidden="true" />
          </span>
          <h2>Tack {firstName}! Beställningen är betald.</h2>
          <p>Vi har skickat den till {restaurant.name}. Spara gärna sidan – här följer du statusen.</p>
        </div>
      )}

      <div className="order-layout">
        <div className="order-layout__main">
          <article className={`pass pass--${order.status}`} aria-label="Hämtbiljett">
            <div className="pass__top">
              <LogoPlate brand={restaurant.brand} size="sm" />
              <div className="pass__place">
                <strong>{restaurant.name}</strong>
                <span>{restaurant.address}</span>
              </div>
            </div>

            <div className="pass__time">
              {order.status === 'ready' ? (
                <>
                  <span className="pass__label">Status</span>
                  <span className="pass__big">Klar att hämta</span>
                  <span className="pass__sub">sedan {clock(reachedAt(order, 'ready') ?? now)}</span>
                </>
              ) : ended ? (
                <>
                  <span className="pass__label">Status</span>
                  <span className="pass__big pass__big--ended">{order.status === 'rejected' ? 'Nekad' : 'Avbruten'}</span>
                  <span className="pass__sub">Återbetalt {order.payment.refundedAt ? clock(order.payment.refundedAt) : ''}</span>
                </>
              ) : order.status === 'picked_up' ? (
                <>
                  <span className="pass__label">Hämtad</span>
                  <span className="pass__big">{clock(reachedAt(order, 'picked_up') ?? time)}</span>
                  <span className="pass__sub">{dayLabel(reachedAt(order, 'picked_up') ?? time, now)}</span>
                </>
              ) : (
                <>
                  <span className="pass__label">{order.confirmedTime ? 'Bekräftad hämttid' : 'Önskad hämttid'}</span>
                  <span className="pass__big tabular">{clock(time)}</span>
                  <span className="pass__sub">
                    {dayLabel(time, now)} · {inMinutes(time, now)}
                  </span>
                </>
              )}
            </div>

            {!ended && (
              <ol className="progress" aria-label="Orderstatus">
                {STEPS.map((step, i) => {
                  // Steg 1 är klart så fort restaurangen har tagit emot; steg 2 och 3 är pågående när de nås.
                  const position = i + 1;
                  const done = index > position || (position === 1 && index >= 1);
                  const current = index === position && position > 1;
                  const pending = index === 0 && position === 1;
                  const at = reachedAt(order, step.key);
                  const Icon = pending ? Hourglass : step.icon;
                  return (
                    <li
                      key={step.key}
                      className={`progress__step${done ? ' is-done' : ''}${current ? ' is-current' : ''}${pending ? ' is-pending' : ''}`}
                      aria-current={current || pending ? 'step' : undefined}
                    >
                      <span className="progress__dot">
                        <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
                      </span>
                      <span className="progress__label">{step.label}</span>
                      <span className="progress__at tabular">{at ? clock(at) : pending ? 'väntar' : ''}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="pass__status" aria-live="polite">
              <strong>{headline.title}</strong>
              {headline.text && <span>{headline.text}</span>}
            </div>

            <div className="pass__tear" aria-hidden="true" />

            <div className="pass__bottom">
              <div>
                <span className="pass__label">Ordernummer</span>
                <span className="pass__number">{order.number}</span>
              </div>
              <div className="pass__who">
                <span className="pass__label">Namn</span>
                <span>{order.customer.name}</span>
              </div>
            </div>
          </article>

          <div className="order-actions">
            {order.status === 'ready' && (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                onClick={() => {
                  markPickedUp(order.id);
                  toast('Smaklig måltid!', { tone: 'success' });
                }}
              >
                <PackageCheck size={20} aria-hidden="true" /> Jag har hämtat maten
              </button>
            )}
            {order.status === 'placed' && (
              <button type="button" className="btn btn--outline btn--block" onClick={() => setConfirmCancel(true)}>
                <X size={18} aria-hidden="true" /> Avbryt beställningen
              </button>
            )}
            {order.status === 'picked_up' && <RateOrder order={order} />}
          </div>

          {order.origin === 'customer' && !ended && order.status !== 'picked_up' && (
            <div className="demo-panel">
              <div>
                <strong>Demoläge</strong>
                <p>
                  {order.autopilot && settings.autopilot
                    ? 'Restaurangen svarar automatiskt och statusen går fortare än i verkligheten.'
                    : 'Personalen styr statusen i restaurangvyn.'}
                </p>
              </div>
              <div className="demo-panel__actions">
                <button type="button" className="btn btn--sm btn--lime" onClick={() => advanceDemo(order.id)}>
                  <FastForward size={16} aria-hidden="true" /> Nästa steg
                </button>
                <Link to={`/partner/${restaurant.id}`} className="btn btn--sm btn--outline">
                  <Store size={16} aria-hidden="true" /> Öppna restaurangvyn
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="order-layout__side">
          <section className="panel order-card">
            <h2>Hämta här</h2>
            <p className="order-card__place">
              <strong>{restaurant.name}</strong>
              <span>
                {restaurant.address}, {restaurant.area}
              </span>
            </p>
            <div className="order-card__actions">
              <a className="btn btn--lime btn--sm" href={directionsUrl(restaurant.lat, restaurant.lng)} target="_blank" rel="noreferrer">
                <Navigation size={16} aria-hidden="true" /> Vägbeskrivning
              </a>
              <button type="button" className="btn btn--outline btn--sm" onClick={copyNumber}>
                <Copy size={14} aria-hidden="true" /> {restaurant.phone}
              </button>
            </div>
          </section>

          {order.notices.length > 0 && (
            <section className="panel order-card">
              <h2>
                Meddelanden <span className="pill pill--amber">Simulerade</span>
              </h2>
              <ul className="notices">
                {[...order.notices].reverse().map((n, i) => (
                  <li key={i}>
                    <span className="notices__icon">{n.channel === 'sms' ? <MessageSquareText size={16} /> : <Mail size={16} />}</span>
                    <span>
                      <span className="notices__meta">
                        {n.channel === 'sms' ? `Sms till ${phone(order.customer.phone)}` : 'E-post'} · {clock(n.at)}
                      </span>
                      {n.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel order-card">
            <h2>Din beställning</h2>
            <ul className="order-lines">
              {order.lines.map((l, i) => (
                <li key={i}>
                  <span className="order-lines__qty tabular">{l.quantity}×</span>
                  <span className="order-lines__name">
                    {l.name}
                    {l.modifiers.length > 0 && <span className="muted">{l.modifiers.join(' · ')}</span>}
                    {l.comment && <span className="muted">”{l.comment}”</span>}
                  </span>
                  <span className="tabular">{kr(l.unitPrice * l.quantity)}</span>
                </li>
              ))}
            </ul>
            {order.note && <p className="order-card__note">Meddelande: ”{order.note}”</p>}
            <dl className="summary__rows summary__rows--compact">
              <div>
                <dt>Delsumma</dt>
                <dd className="tabular">{kr(order.subtotal)}</dd>
              </div>
              <div>
                <dt>Serviceavgift</dt>
                <dd className="tabular">{kr(order.serviceFee)}</dd>
              </div>
              <div className="summary__total">
                <dt>Totalt</dt>
                <dd className="tabular">{kr(order.total)}</dd>
              </div>
            </dl>
            <p className="order-card__payment">
              {order.payment.method === 'wallet' ? walletName() : PAYMENT_LABEL[order.payment.method]} · betald {clock(order.payment.paidAt)}
              {order.payment.refundedAt && ' · återbetald'} <span className="pill pill--amber">Simulerad</span>
            </p>
            <button type="button" className="btn btn--outline btn--block" onClick={() => setReceiptOpen(true)}>
              <ReceiptText size={18} aria-hidden="true" /> Visa kvitto
            </button>
          </section>
        </div>
      </div>

      <Receipt order={order} restaurant={restaurant} open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      <ConfirmDialog
        open={confirmCancel}
        title="Avbryta beställningen?"
        message={<p>Restaurangen har inte börjat på den än. Du får tillbaka {kr(order.total)}.</p>}
        confirmLabel="Avbryt beställningen"
        cancelLabel="Behåll"
        tone="danger"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          cancelOrder(order.id);
          setConfirmCancel(false);
          toast('Beställningen är avbruten och pengarna återbetalas');
        }}
      />
    </div>
  );
}

function RateOrder({ order }: { order: Order }) {
  const [hover, setHover] = useState(0);
  if (order.rating) {
    return (
      <p className="rate rate--done">
        Du gav {order.rating} av 5 stjärnor. Tack för ditt omdöme!
      </p>
    );
  }
  return (
    <div className="rate">
      <strong>Hur var maten?</strong>
      <div className="rate__stars" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rate__star${n <= hover ? ' is-on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => {
              rateOrder(order.id, n);
              toast('Tack för ditt omdöme!', { tone: 'success' });
            }}
            aria-label={`${n} av 5 stjärnor`}
          >
            <Star size={30} fill={n <= hover ? 'currentColor' : 'none'} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Receipt({ order, restaurant, open, onClose }: { order: Order; restaurant: Restaurant; open: boolean; onClose: () => void }) {
  const foodVat = includedVat(order.subtotal, order.vatPct);
  const feeVat = includedVat(order.serviceFee, 25);
  return (
    <Sheet open={open} onClose={onClose} title="Kvitto" size="sm">
      <div className="receipt">
        <p className="receipt__demo">Demokvitto – inte giltigt för bokföring</p>
        <div className="receipt__head">
          <strong>{restaurant.name}</strong>
          <span>
            {restaurant.address}, {restaurant.area}
          </span>
          <span>Förmedlat via Foodi</span>
        </div>
        <dl className="receipt__meta">
          <div>
            <dt>Order</dt>
            <dd>{order.number}</dd>
          </div>
          <div>
            <dt>Datum</dt>
            <dd>
              {longDate(order.createdAt)} {clock(order.createdAt)}
            </dd>
          </div>
          <div>
            <dt>Betalning</dt>
            <dd>
              {order.payment.method === 'wallet' ? walletName() : PAYMENT_LABEL[order.payment.method]} {order.payment.reference}
            </dd>
          </div>
        </dl>
        <ul className="receipt__lines">
          {order.lines.map((l, i) => (
            <li key={i}>
              <span>
                {l.quantity} × {l.name}
                {l.modifiers.length > 0 && <small>{l.modifiers.join(', ')}</small>}
              </span>
              <span className="tabular">{kr(l.unitPrice * l.quantity)}</span>
            </li>
          ))}
          <li>
            <span>Serviceavgift Foodi</span>
            <span className="tabular">{kr(order.serviceFee)}</span>
          </li>
        </ul>
        <div className="receipt__total">
          <span>Totalt</span>
          <span className="tabular">{kr(order.total)}</span>
        </div>
        <dl className="receipt__vat">
          <div>
            <dt>Moms {order.vatPct} % på mat</dt>
            <dd className="tabular">{foodVat.toFixed(2).replace('.', ',')} kr</dd>
          </div>
          <div>
            <dt>Moms 25 % på serviceavgift</dt>
            <dd className="tabular">{feeVat.toFixed(2).replace('.', ',')} kr</dd>
          </div>
        </dl>
        {order.payment.refundedAt && <p className="receipt__refund">Återbetalt {when(order.payment.refundedAt, Date.now())}</p>}
      </div>
    </Sheet>
  );
}
