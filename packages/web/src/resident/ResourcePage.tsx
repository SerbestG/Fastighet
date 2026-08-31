import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatAmount, formatDate, formatTime, longDate } from '../lib/format.js';
import { Banner, Button, QueryBoundary, Sheet } from '../components/ui.js';
import { ChevronLeft } from '../components/icons.js';

interface Slot {
  startsAt: string;
  endsAt: string;
  status: 'available' | 'taken' | 'mine' | 'blocked' | 'unavailable';
  blockReason: string | null;
}

interface SlotsResponse {
  resource: {
    id: string;
    name: string;
    kind: string;
    description: string | null;
    slot_minutes: number;
    max_active_per_tenancy: number;
    max_days_ahead: number;
    cancellation_hours: number;
    price_ore: number;
    deposit_ore: number;
    waitlist_enabled: boolean;
  };
  slots: Slot[];
}

/** Ledtiderna visas som ett schema, inte som en lista med datumfält. */
export function ResourcePage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => new Date(Date.now() + index * 86_400_000)),
    [],
  );
  const [selectedDay, setSelectedDay] = useState(0);
  const from = formatDate(days[0]!);
  const to = formatDate(days[days.length - 1]!);

  const state = useQuery<SlotsResponse>(id ? `/api/booking/resources/${id}/slots?from=${from}&to=${to}` : null);
  const [pending, setPending] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);

  const book = async (joinWaitlist = false) => {
    if (!pending || !id) return;
    setBooking(true);
    try {
      const result = await api.post<{ booking?: unknown; waitlisted?: boolean }>('/api/bookings', {
        resourceId: id,
        startsAt: pending.startsAt,
        endsAt: pending.endsAt,
        joinWaitlist,
      });
      toast.show(result.waitlisted ? t('booking.waitlisted') : 'Din tid är bokad.');
      setPending(null);
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="page stack stack-5">
      <div className="row">
        <button type="button" className="icon-btn" onClick={() => navigate('/boka')} aria-label={t('common.back')}>
          <ChevronLeft />
        </button>
        <h1 className="grow" style={{ fontSize: 'var(--text-xl)' }}>
          {state.data?.resource.name ?? t('booking.selectTime')}
        </h1>
      </div>

      <QueryBoundary state={state}>
        {(data) => {
          const dayKey = formatDate(days[selectedDay]!);
          const slotsForDay = data.slots.filter((slot) => formatDate(slot.startsAt) === dayKey);

          return (
            <>
              {data.resource.description ? <p className="muted">{data.resource.description}</p> : null}

              <div className="day-strip" role="tablist" aria-label="Välj dag">
                {days.map((day, index) => (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className="day-chip"
                    aria-pressed={index === selectedDay}
                    onClick={() => setSelectedDay(index)}
                  >
                    <span className="dow">
                      {new Intl.DateTimeFormat('sv-SE', { weekday: 'short', timeZone: 'Europe/Stockholm' }).format(day)}
                    </span>
                    <span className="dom">
                      {new Intl.DateTimeFormat('sv-SE', { day: 'numeric', timeZone: 'Europe/Stockholm' }).format(day)}
                    </span>
                  </button>
                ))}
              </div>

              {slotsForDay.length === 0 ? (
                <p className="muted">Inga tider den här dagen.</p>
              ) : (
                <div className="slot-grid">
                  {slotsForDay.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      className="slot"
                      data-status={slot.status}
                      disabled={slot.status === 'unavailable' || slot.status === 'blocked'}
                      onClick={() => (slot.status === 'available' || (slot.status === 'taken' && data.resource.waitlist_enabled) ? setPending(slot) : undefined)}
                      aria-label={`${formatTime(slot.startsAt)} till ${formatTime(slot.endsAt)}, ${labelFor(slot, t)}`}
                    >
                      {formatTime(slot.startsAt)}
                      <span className="slot-note">{labelFor(slot, t)}</span>
                    </button>
                  ))}
                </div>
              )}

              <section className="card stack stack-2">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('booking.rules')}
                </h2>
                <ul className="small muted" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  <li>{t('booking.maxActive', { count: data.resource.max_active_per_tenancy })}</li>
                  <li>Bokning kan göras upp till {data.resource.max_days_ahead} dagar i förväg.</li>
                  <li>Avbokning senast {data.resource.cancellation_hours} timmar före bokad tid.</li>
                  {data.resource.price_ore > 0 ? <li>Avgift {formatAmount(data.resource.price_ore)}.</li> : null}
                  {data.resource.deposit_ore > 0 ? <li>Deposition {formatAmount(data.resource.deposit_ore)}.</li> : null}
                </ul>
              </section>

              {pending ? (
                <Sheet
                  title={t('booking.confirm')}
                  onClose={() => setPending(null)}
                  footer={
                    <>
                      <Button
                        variant="primary"
                        block
                        loading={booking}
                        onClick={() => void book(pending.status === 'taken')}
                      >
                        {pending.status === 'taken' ? t('booking.waitlist') : t('booking.confirm')}
                      </Button>
                      <Button variant="ghost" block onClick={() => setPending(null)}>
                        {t('common.cancel')}
                      </Button>
                    </>
                  }
                >
                  <div className="stack stack-3">
                    <div className="card">
                      <div className="strong">{data.resource.name}</div>
                      <div className="muted">
                        {longDate(pending.startsAt)} {formatTime(pending.startsAt)}–{formatTime(pending.endsAt)}
                      </div>
                    </div>
                    {data.resource.price_ore > 0 ? (
                      <Banner tone="info" title={`Avgift ${formatAmount(data.resource.price_ore)}`}>
                        <p className="small">Avgiften läggs på nästa hyresavi.</p>
                      </Banner>
                    ) : null}
                    {pending.status === 'taken' ? (
                      <Banner tone="warning" title="Tiden är redan bokad">
                        <p className="small">Vi meddelar dig om tiden blir ledig.</p>
                      </Banner>
                    ) : null}
                  </div>
                </Sheet>
              ) : null}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function labelFor(
  slot: Slot,
  t: (key: 'booking.available' | 'booking.taken' | 'booking.blocked' | 'booking.yours') => string,
): string {
  switch (slot.status) {
    case 'available':
      return t('booking.available');
    case 'mine':
      return t('booking.yours');
    case 'taken':
      return t('booking.taken');
    case 'blocked':
      return slot.blockReason ?? t('booking.blocked');
    default:
      // Tider som redan passerat eller ligger utanför bokningsfönstret.
      return new Date(slot.startsAt) < new Date() ? 'Passerad' : 'För långt fram';
  }
}
