import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { longDate, timeRange } from '../lib/format.js';
import { Banner, Button, EmptyState, Field, Input, Pill, QueryBoundary, Sheet, Tabs } from '../components/ui.js';
import { CalendarIcon } from '../components/icons.js';

interface Resource {
  id: string;
  kind: string;
  name: string;
  scope: string;
  slot_minutes: number;
  opens_at: string;
  closes_at: string;
  max_active_per_tenancy: number;
  cancellation_hours: number;
  price_ore: number;
  active: boolean;
  upcoming_bookings: number;
}

interface Booking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  note: string | null;
  case_id: string | null;
  resource_name: string;
  resource_kind: string;
  first_name: string | null;
  last_name: string | null;
  object_number: string | null;
  property_name: string | null;
}

export function BookingsAdminPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'bookings' | 'resources'>('bookings');
  const bookings = useQuery<{ bookings: Booking[] }>('/api/staff/bookings');
  const resources = useQuery<{ resources: Resource[] }>('/api/staff/resources');
  const [blockFor, setBlockFor] = useState<Resource | null>(null);
  const [block, setBlock] = useState({ startsAt: '', endsAt: '', reason: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const saveBlock = async () => {
    if (!blockFor) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ cancelledBookings: number }>('/api/staff/resource-blocks', {
        resourceId: blockFor.id,
        startsAt: new Date(block.startsAt).toISOString(),
        endsAt: new Date(block.endsAt).toISOString(),
        reason: block.reason,
      });
      toast.show(
        result.cancelledBookings
          ? `Tiden är spärrad. ${result.cancelledBookings} bokningar avbokades och hyresgästerna har meddelats.`
          : 'Tiden är spärrad.',
      );
      setBlockFor(null);
      setBlock({ startsAt: '', endsAt: '', reason: '' });
      bookings.reload();
      resources.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Service</div>
        <h1>{t('staff.bookings')}</h1>
      </header>

      <Tabs
        label="Vy"
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'bookings', label: 'Bokningar' },
          { value: 'resources', label: 'Resurser' },
        ]}
      />

      {tab === 'bookings' ? (
        <QueryBoundary
          state={bookings}
          empty={{
            when: (data) => data.bookings.length === 0,
            render: <EmptyState icon={<CalendarIcon size={24} />} title="Inga bokningar" body="Inget är bokat de närmaste två veckorna." />,
          }}
        >
          {(data) => (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Tid</th>
                    <th>Resurs</th>
                    <th className="hide-mobile">Hyresgäst</th>
                    <th className="hide-mobile">Objekt</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td className="small nowrap">
                        {longDate(booking.starts_at)}
                        <div className="xs subtle">{timeRange(booking.starts_at, booking.ends_at)}</div>
                      </td>
                      <td className="small">{booking.resource_name}</td>
                      <td className="hide-mobile small">
                        {booking.first_name ? `${booking.first_name} ${booking.last_name ?? ''}` : '–'}
                      </td>
                      <td className="hide-mobile small">{booking.object_number ?? '–'}</td>
                      <td>
                        <Pill tone={booking.status === 'cancelled' ? 'neutral' : booking.status === 'reserved' ? 'warning' : 'success'}>
                          {booking.status === 'cancelled' ? 'Avbokad' : booking.status === 'reserved' ? 'Väntar' : 'Bekräftad'}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      ) : (
        <QueryBoundary state={resources}>
          {(data) => (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Resurs</th>
                    <th className="hide-mobile">Öppettider</th>
                    <th className="hide-mobile">Regler</th>
                    <th className="num">Kommande</th>
                    {can('resource:write') ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.resources.map((resource) => (
                    <tr key={resource.id}>
                      <td>
                        <div className="strong">{resource.name}</div>
                        <div className="xs subtle">{resource.kind}</div>
                      </td>
                      <td className="hide-mobile small num">
                        {resource.opens_at.slice(0, 5)}–{resource.closes_at.slice(0, 5)} · {resource.slot_minutes} min
                      </td>
                      <td className="hide-mobile small">
                        Max {resource.max_active_per_tenancy} aktiva · avbokning {resource.cancellation_hours} tim
                      </td>
                      <td className="num">{resource.upcoming_bookings}</td>
                      {can('resource:write') ? (
                        <td>
                          <Button size="sm" variant="ghost" onClick={() => setBlockFor(resource)}>
                            Spärra tid
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryBoundary>
      )}

      {blockFor ? (
        <Sheet
          title={`Spärra tid – ${blockFor.name}`}
          onClose={() => setBlockFor(null)}
          footer={
            <Button
              variant="primary"
              block
              loading={pending}
              disabled={!block.startsAt || !block.endsAt || !block.reason}
              onClick={() => void saveBlock()}
            >
              Spärra
            </Button>
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            <Banner tone="warning" title="Bokningar i den spärrade tiden avbokas">
              <p className="small">Berörda hyresgäster får en notis med anledningen.</p>
            </Banner>
            <Field label="Från">
              {({ id }) => <Input id={id} type="datetime-local" value={block.startsAt} onChange={(event) => setBlock({ ...block, startsAt: event.target.value })} />}
            </Field>
            <Field label="Till">
              {({ id }) => <Input id={id} type="datetime-local" value={block.endsAt} onChange={(event) => setBlock({ ...block, endsAt: event.target.value })} />}
            </Field>
            <Field label="Anledning" hint="Visas för hyresgästen.">
              {({ id }) => <Input id={id} value={block.reason} onChange={(event) => setBlock({ ...block, reason: event.target.value })} />}
            </Field>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
