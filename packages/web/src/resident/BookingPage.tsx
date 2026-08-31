import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatAmount, longDate, timeRange } from '../lib/format.js';
import { Button, EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { CalendarIcon, ChevronRight, DownloadIcon } from '../components/icons.js';

interface Resource {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  slot_minutes: number;
  max_active_per_tenancy: number;
  cancellation_hours: number;
  price_ore: number;
  deposit_ore: number;
  waitlist_enabled: boolean;
  activeBookings: number;
  digitalAccess: boolean;
}

interface Booking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  resource_name: string;
  resource_kind: string;
  cancellation_hours: number;
  access_code: string | null;
  upcoming: boolean;
  case_id: string | null;
}

const KIND_LABEL: Record<string, string> = {
  laundry: 'Tvättstuga',
  common_room: 'Gemensamhetslokal',
  sauna: 'Bastu',
  guest_apartment: 'Gästlägenhet',
  parking: 'Parkering',
  caretaker_visit: 'Besök av fastighetsskötare',
  inspection: 'Besiktning',
  key_pickup: 'Nyckelhämtning',
  other: 'Övrigt',
};

export function BookingPage() {
  const { t } = useI18n();
  const toast = useToast();
  const resources = useQuery<{ resources: Resource[] }>('/api/booking/resources');
  const bookings = useQuery<{ bookings: Booking[]; waitlist: { id: string; resource_name: string; starts_at: string }[] }>(
    '/api/bookings',
  );

  const cancel = async (id: string) => {
    try {
      await api.del(`/api/bookings/${id}`);
      toast.show(t('booking.cancelled'));
      bookings.reload();
      resources.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    }
  };

  const downloadIcs = async (id: string) => {
    try {
      const text = await api.get<string>(`/api/bookings/${id}/calendar.ics`);
      const blob = new Blob([text as unknown as string], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bokning.ics';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.show('Kalenderfilen kunde inte hämtas.', 'error');
    }
  };

  return (
    <div className="page stack stack-6">
      <header className="page-header">
        <h1>{t('booking.title')}</h1>
      </header>

      <section className="stack stack-3">
        <h2 className="section-title">{t('booking.myBookings')}</h2>
        <QueryBoundary
          state={bookings}
          loadingRows={2}
          empty={{
            when: (data) => data.bookings.filter((b) => b.upcoming && b.status !== 'cancelled').length === 0,
            render: <EmptyState icon={<CalendarIcon size={24} />} title={t('booking.noneTitle')} body={t('booking.noneBody')} />,
          }}
        >
          {(data) => (
            <div className="stack stack-3">
              {data.bookings
                .filter((booking) => booking.upcoming && booking.status !== 'cancelled')
                .map((booking) => (
                  <div className="card stack stack-3" key={booking.id}>
                    <div className="row-between row-start">
                      <div>
                        <div className="strong">{booking.resource_name}</div>
                        <div className="small muted">
                          {longDate(booking.starts_at)} {timeRange(booking.starts_at, booking.ends_at)}
                        </div>
                      </div>
                      <Pill tone={booking.status === 'reserved' ? 'warning' : 'success'}>
                        {booking.status === 'reserved' ? 'Väntar på godkännande' : 'Bekräftad'}
                      </Pill>
                    </div>
                    {booking.access_code ? (
                      <div className="banner banner-info">
                        <div>
                          <strong>{t('booking.accessCode')}</strong>
                          <code style={{ fontSize: 'var(--text-lg)', letterSpacing: '0.1em' }}>{booking.access_code}</code>
                        </div>
                      </div>
                    ) : null}
                    <div className="row">
                      <Button size="sm" variant="secondary" icon={<DownloadIcon size={16} />} onClick={() => void downloadIcs(booking.id)}>
                        {t('booking.addToCalendar')}
                      </Button>
                      {booking.case_id ? (
                        <Link className="btn btn-ghost btn-sm" to={`/arenden/${booking.case_id}`}>
                          Till ärendet
                        </Link>
                      ) : (
                        <Button size="sm" variant="danger" onClick={() => void cancel(booking.id)}>
                          {t('booking.cancel')}
                        </Button>
                      )}
                    </div>
                    <p className="xs subtle">
                      Avbokning senast {booking.cancellation_hours} timmar före bokad tid.
                    </p>
                  </div>
                ))}
              {data.waitlist.map((entry) => (
                <div className="card row-between" key={entry.id}>
                  <div>
                    <div className="strong">{entry.resource_name}</div>
                    <div className="small muted">{longDate(entry.starts_at)}</div>
                  </div>
                  <Pill tone="neutral">{t('booking.waitlisted')}</Pill>
                </div>
              ))}
            </div>
          )}
        </QueryBoundary>
      </section>

      <section className="stack stack-3">
        <h2 className="section-title">{t('booking.resources')}</h2>
        <QueryBoundary
          state={resources}
          empty={{
            when: (data) => data.resources.length === 0,
            render: <EmptyState title="Inga bokningsbara resurser" body="Din adress har inga resurser att boka just nu." />,
          }}
        >
          {(data) => (
            <div className="card card-flush">
              {data.resources.map((resource) => (
                <Link className="list-item" to={`/boka/${resource.id}`} key={resource.id}>
                  <span className="grow stack stack-1">
                    <span className="list-title">{resource.name}</span>
                    <span className="list-meta">{KIND_LABEL[resource.kind] ?? resource.kind}</span>
                    <span className="row" style={{ gap: 'var(--space-2)', marginTop: 4 }}>
                      {resource.price_ore > 0 ? <span className="tag">{formatAmount(resource.price_ore)}</span> : null}
                      {resource.deposit_ore > 0 ? (
                        <span className="tag">Deposition {formatAmount(resource.deposit_ore)}</span>
                      ) : null}
                      <span className="tag">
                        {resource.activeBookings}/{resource.max_active_per_tenancy} bokningar
                      </span>
                    </span>
                  </span>
                  <ChevronRight size={18} className="chevron" />
                </Link>
              ))}
            </div>
          )}
        </QueryBoundary>
      </section>
    </div>
  );
}
