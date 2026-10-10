import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Info, Lock, MapPin, Navigation, Pencil, Plus, ShieldCheck, Zap } from 'lucide-react';
import type { CartLine, PaymentMethod } from '../../types';
import { placeOrder, setLineQuantity, useAppState } from '../../store/store';
import { useNow } from '../../store/hooks';
import { cartTotals } from '../../store/pricing';
import { toast } from '../../store/toast';
import { clock, dayLabel, inMinutes, isMobileNumber, kr, plural } from '../../lib/format';
import { directionsUrl } from '../../lib/geo';
import { asapTime, isPickupTimeValid, openState, pickupDays } from '../../lib/time';
import { PageHeader } from '../../components/Layout';
import { DishImage, RestaurantCover } from '../../components/Media';
import { QuantityStepper } from '../../components/Bits';
import { restaurantStatus } from '../../components/status';
import { DishSheet } from './DishSheet';
import { PaymentIcon, PaymentSheet, walletName } from './PaymentSheet';

type Errors = Partial<Record<'pickup' | 'name' | 'phone' | 'email' | 'cart' | 'restaurant', string>>;

export function CheckoutPage() {
  const navigate = useNavigate();
  const { cart, restaurants, settings, customer } = useAppState();
  const restaurant = restaurants.find((r) => r.id === cart?.restaurantId);
  const totals = cartTotals(cart, restaurant, settings);
  const now = useNow(20_000);

  const asap = restaurant ? asapTime(restaurant, now) : null;
  const days = useMemo(() => (restaurant ? pickupDays(restaurant, now) : []), [restaurant, now]);
  const [mode, setMode] = useState<'asap' | 'scheduled'>(asap ? 'asap' : 'scheduled');
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex((d) => d.slots.length > 0)));
  const [slot, setSlot] = useState<number | null>(null);
  const [name, setName] = useState(customer?.name ?? '');
  const [phoneNumber, setPhoneNumber] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [remember, setRemember] = useState(true);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('swish');
  const [errors, setErrors] = useState<Errors>({});
  const [paying, setPaying] = useState(false);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [feeInfo, setFeeInfo] = useState(false);

  // Om restaurangen stänger medan kassan är öppen går det inte längre att hämta direkt.
  useEffect(() => {
    if (mode === 'asap' && !asap) setMode('scheduled');
  }, [asap, mode]);

  if (!cart || !restaurant || totals.lines.length === 0) {
    return (
      <div className="page-width">
        <PageHeader title="Varukorg" back />
        <div className="empty">
          <div className="empty__art" aria-hidden="true">
            🛍️
          </div>
          <h2>Varukorgen är tom</h2>
          <p>Hitta något gott nära dig och lägg det i varukorgen.</p>
          <Link to="/" className="btn btn--primary">
            Hitta restauranger
          </Link>
        </div>
      </div>
    );
  }

  const status = restaurantStatus(restaurant, now);
  const state = openState(restaurant, now);
  const day = days[dayIndex];
  const pickupTime = mode === 'asap' ? asap : slot;

  const validate = (): Errors => {
    const e: Errors = {};
    if (state.open === false && state.reason === 'suspended') e.restaurant = 'Restaurangen tar inte emot beställningar just nu.';
    if (totals.hasUnavailable) e.cart = 'Ta bort rätter som är slutsålda innan du betalar.';
    if (totals.count === 0) e.cart = 'Lägg till minst en rätt.';
    if (mode === 'asap' && !asap) e.pickup = 'Det går inte att hämta direkt just nu. Välj en senare tid.';
    if (mode === 'scheduled' && (slot === null || !isPickupTimeValid(restaurant, slot, Date.now()))) e.pickup = 'Välj en hämttid.';
    if (name.trim().length < 2) e.name = 'Skriv ditt namn så att personalen vet vem maten är till.';
    if (!isMobileNumber(phoneNumber)) e.phone = 'Ange ett svenskt mobilnummer, t.ex. 070-123 45 67.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'E-postadressen ser inte rätt ut.';
    return e;
  };

  const startPayment = () => {
    const e = validate();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`co-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Kontrollera de markerade uppgifterna', { tone: 'error' });
      return;
    }
    setPaying(true);
  };

  const completePayment = () => {
    if (pickupTime === null) return;
    const order = placeOrder({
      pickup: { mode, time: pickupTime },
      customer: { name: name.trim(), phone: phoneNumber.replace(/[\s-]/g, ''), email: email.trim() || undefined },
      method,
      note,
      remember,
    });
    setPaying(false);
    navigate(`/order/${order.id}?ny=1`, { replace: true });
  };

  const editDish = editLine ? restaurant.dishes.find((d) => d.id === editLine.dishId) : undefined;

  const methods: { id: PaymentMethod; label: string; hint: string }[] = [
    { id: 'swish', label: 'Swish', hint: 'Godkänn i Swish-appen' },
    { id: 'card', label: 'Kort', hint: 'Testkort •••• 4242' },
    { id: 'wallet', label: walletName(), hint: 'Snabbt med Face ID eller fingeravtryck' },
  ];

  return (
    <div className="page-width checkout-page">
      <PageHeader title="Kassa" subtitle={`Hämtas hos ${restaurant.name}`} back />
      <div className="checkout">
        <div className="checkout__main">
          <section className="co-section" id="co-cart" aria-labelledby="co-cart-title">
            <div className="co-section__head">
              <h2 id="co-cart-title">Din beställning</h2>
              <Link to={`/r/${restaurant.id}`} className="btn btn--ghost btn--sm">
                <Plus size={16} aria-hidden="true" /> Lägg till mer
              </Link>
            </div>
            {errors.cart && <p className="field__error">{errors.cart}</p>}
            <ul className="co-lines">
              {totals.lines.map((l) => (
                <li key={l.line.id} className={`co-line${l.unavailable ? ' is-unavailable' : ''}`}>
                  {l.dish ? <DishImage dish={l.dish} brand={restaurant.brand} className="co-line__img" /> : <span className="co-line__img" />}
                  <div className="co-line__body">
                    <strong className="co-line__name">{l.dish?.name ?? 'Rätten finns inte längre'}</strong>
                    {l.modifiers.length > 0 && <span className="co-line__mods">{l.modifiers.join(' · ')}</span>}
                    {l.line.comment && <span className="co-line__mods">”{l.line.comment}”</span>}
                    {l.unavailable ? (
                      <span className="pill pill--red">Slutsåld – ta bort för att fortsätta</span>
                    ) : (
                      l.dish && (
                        <button type="button" className="co-line__edit" onClick={() => setEditLine(l.line)}>
                          <Pencil size={13} aria-hidden="true" /> Ändra
                        </button>
                      )
                    )}
                  </div>
                  <div className="co-line__side">
                    <span className="co-line__price tabular">{kr(l.total)}</span>
                    <QuantityStepper value={l.line.quantity} min={0} onChange={(v) => setLineQuantity(l.line.id, v)} label={`Antal ${l.dish?.name ?? ''}`} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="field">
              <label htmlFor="co-note" className="field__label">
                Meddelande till restaurangen <span className="muted">(valfritt)</span>
              </label>
              <textarea
                id="co-note"
                className="textarea"
                rows={2}
                maxLength={240}
                placeholder="T.ex. bestick behövs inte"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </section>

          <section className="co-section" id="co-pickup" aria-labelledby="co-pickup-title">
            <h2 id="co-pickup-title">När vill du hämta?</h2>
            <div className="pickup-place">
              <RestaurantCover restaurant={restaurant} variant="thumb" />
              <div className="pickup-place__text">
                <strong>{restaurant.name}</strong>
                <span>
                  <MapPin size={14} aria-hidden="true" /> {restaurant.address}, {restaurant.area}
                </span>
                <span className={`pickup-place__status pickup-place__status--${status.tone}`}>{status.label}</span>
              </div>
              <a className="btn btn--outline btn--sm" href={directionsUrl(restaurant.lat, restaurant.lng)} target="_blank" rel="noreferrer">
                <Navigation size={14} aria-hidden="true" /> Karta
              </a>
            </div>

            <div className="pickup-options" role="radiogroup" aria-label="Hämttid">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'asap'}
                className={`pickup-option${mode === 'asap' ? ' is-on' : ''}`}
                onClick={() => asap && setMode('asap')}
                disabled={!asap}
              >
                <span className="pickup-option__icon">
                  <Zap size={20} aria-hidden="true" />
                </span>
                <span className="pickup-option__text">
                  <strong>Så snart som möjligt</strong>
                  <span>{asap ? `Klar ca ${clock(asap)} · ${inMinutes(asap, now)}` : 'Inte möjligt just nu'}</span>
                </span>
                <span className="radio-dot" aria-hidden="true" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'scheduled'}
                className={`pickup-option${mode === 'scheduled' ? ' is-on' : ''}`}
                onClick={() => setMode('scheduled')}
              >
                <span className="pickup-option__icon">
                  <CalendarClock size={20} aria-hidden="true" />
                </span>
                <span className="pickup-option__text">
                  <strong>Välj en senare tid</strong>
                  <span>{slot && mode === 'scheduled' ? `${dayLabel(slot, now)} ${clock(slot)}` : 'Idag eller de närmaste dagarna'}</span>
                </span>
                <span className="radio-dot" aria-hidden="true" />
              </button>
            </div>

            {mode === 'scheduled' && (
              <div className="slot-picker">
                <div className="seg" role="tablist" aria-label="Dag">
                  {days.map((d, i) => (
                    <button
                      key={d.dayStart}
                      type="button"
                      role="tab"
                      aria-selected={i === dayIndex}
                      className="seg__item"
                      onClick={() => {
                        setDayIndex(i);
                        setSlot(null);
                      }}
                    >
                      {dayLabel(d.dayStart, now)}
                      <span className="seg__sub">{d.slots.length > 0 ? `${d.slots.length} tider` : 'Stängt'}</span>
                    </button>
                  ))}
                </div>
                {day && day.slots.length > 0 ? (
                  <div className="slots" role="radiogroup" aria-label={`Tider ${dayLabel(day.dayStart, now).toLowerCase()}`}>
                    {day.slots.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={slot === t} className="slot" onClick={() => {
                          setSlot(t);
                          setErrors((prev) => ({ ...prev, pickup: undefined }));
                        }}>
                        {clock(t)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted slot-picker__empty">Restaurangen har inga lediga hämttider den här dagen.</p>
                )}
              </div>
            )}
            {errors.pickup && <p className="field__error">{errors.pickup}</p>}
            <p className="field__hint pickup-hint">
              <Info size={14} aria-hidden="true" /> Restaurangen bekräftar tiden när den tar emot beställningen. Du får ett sms när maten är
              klar.
            </p>
          </section>

          <section className="co-section" aria-labelledby="co-contact-title">
            <div className="co-section__head">
              <h2 id="co-contact-title">Dina uppgifter</h2>
              <span className="pill pill--lime">Inget konto behövs</span>
            </div>
            <div className="form-grid">
              <div className="field" id="co-name">
                <label htmlFor="name" className="field__label">
                  Namn
                </label>
                <input
                  id="name"
                  className="input"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : 'name-hint'}
                />
                {errors.name ? (
                  <span id="name-error" className="field__error">
                    {errors.name}
                  </span>
                ) : (
                  <span id="name-hint" className="field__hint">
                    Personalen ropar upp ditt namn
                  </span>
                )}
              </div>
              <div className="field" id="co-phone">
                <label htmlFor="phone" className="field__label">
                  Mobilnummer
                </label>
                <input
                  id="phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="070-123 45 67"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'phone-error' : 'phone-hint'}
                />
                {errors.phone ? (
                  <span id="phone-error" className="field__error">
                    {errors.phone}
                  </span>
                ) : (
                  <span id="phone-hint" className="field__hint">
                    För sms när maten är klar
                  </span>
                )}
              </div>
              <div className="field form-grid__wide" id="co-email">
                <label htmlFor="email" className="field__label">
                  E-post för kvitto <span className="muted">(valfritt)</span>
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && <span className="field__error">{errors.email}</span>}
              </div>
            </div>
            <label className="checkbox" htmlFor="remember">
              <input id="remember" type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Kom ihåg mina uppgifter på den här enheten</span>
            </label>
          </section>

          <section className="co-section" aria-labelledby="co-pay-title">
            <h2 id="co-pay-title">Betalning</h2>
            <div className="pay-methods" role="radiogroup" aria-label="Betalsätt">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  className={`pay-method${method === m.id ? ' is-on' : ''}`}
                  onClick={() => setMethod(m.id)}
                >
                  <span className={`pay-method__icon pay-method__icon--${m.id}`}>
                    <PaymentIcon method={m.id} />
                  </span>
                  <span className="pay-method__text">
                    <strong>{m.label}</strong>
                    <span>{m.hint}</span>
                  </span>
                  <span className="radio-dot" aria-hidden="true" />
                </button>
              ))}
            </div>
            <p className="notice notice--amber">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <strong>Prototyp:</strong> betalningen är simulerad. Inga pengar dras och vi frågar aldrig efter riktiga kortuppgifter.
              </span>
            </p>
          </section>
        </div>

        <aside className="checkout__aside">
          <div className="summary">
            <h2 className="summary__title">Att betala</h2>
            <dl className="summary__rows">
              <div>
                <dt>Delsumma ({plural(totals.count, 'rätt', 'rätter')}, inkl. moms)</dt>
                <dd className="tabular">{kr(totals.subtotal)}</dd>
              </div>
              <div>
                <dt>
                  Serviceavgift {settings.serviceFeePct} %
                  <button type="button" className="info-btn" onClick={() => setFeeInfo((v) => !v)} aria-expanded={feeInfo} aria-label="Om serviceavgiften">
                    <Info size={15} />
                  </button>
                </dt>
                <dd className="tabular">{kr(totals.serviceFee)}</dd>
              </div>
              {feeInfo && (
                <p className="summary__fee-info">
                  Avgiften går till Foodi och täcker betalning, sms och drift. Den är {settings.serviceFeePct} % av matpriset och högst{' '}
                  {kr(settings.serviceFeeCap)}. Restaurangen sätter matpriserna.
                </p>
              )}
              <div className="summary__total">
                <dt>Totalt</dt>
                <dd className="tabular">{kr(totals.total)}</dd>
              </div>
            </dl>
            <p className="summary__pickup">
              {pickupTime ? (
                <>
                  Hämtas <strong>{dayLabel(pickupTime, now).toLowerCase()} {clock(pickupTime)}</strong> på {restaurant.address}
                </>
              ) : (
                'Välj när du vill hämta'
              )}
            </p>
            <button type="button" className="btn btn--primary btn--lg btn--block summary__pay" onClick={startPayment}>
              <Lock size={18} aria-hidden="true" />
              Betala {kr(totals.total)}
            </button>
            <p className="summary__terms">Genom att betala godkänner du Foodis villkor. Simulerad betalning i prototypen.</p>
          </div>
        </aside>
      </div>

      <div className="pay-bar">
        <div className="pay-bar__total">
          <span>Totalt</span>
          <strong className="tabular">{kr(totals.total)}</strong>
        </div>
        <button type="button" className="btn btn--primary btn--lg pay-bar__btn" onClick={startPayment}>
          <Lock size={18} aria-hidden="true" />
          Betala
        </button>
      </div>

      <PaymentSheet
        open={paying}
        method={method}
        amount={totals.total}
        phoneNumber={phoneNumber}
        onSuccess={completePayment}
        onCancel={() => {
          setPaying(false);
          toast('Betalningen avbröts. Inget har dragits.');
        }}
      />
      <DishSheet restaurant={restaurant} dish={editDish} editLine={editLine ?? undefined} open={editLine !== null} onClose={() => setEditLine(null)} />
    </div>
  );
}
