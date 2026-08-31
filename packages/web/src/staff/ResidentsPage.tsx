import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { relativeTime } from '../lib/format.js';
import { Banner, Button, EmptyState, Field, Input, Pill, QueryBoundary, Sheet } from '../components/ui.js';
import { SearchIcon, UserIcon } from '../components/icons.js';

interface Resident {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  locale: string;
  status: string;
  last_login_at: string | null;
  role: string;
  is_primary: boolean;
  tenancy_id: string;
  tenancy_status: string;
  object_number: string;
  unit_label: string;
  property_name: string;
  property_street: string;
}

export function ResidentsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const state = useQuery<{ residents: Resident[] }>(
    `/api/staff/residents?limit=200${search ? `&q=${encodeURIComponent(search)}` : ''}`,
    [search],
  );
  const [inviteFor, setInviteFor] = useState<Resident | null>(null);
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', role: 'co_resident' });
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const sendInvite = async () => {
    if (!inviteFor) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ code: string }>('/api/staff/invitations', {
        tenancyId: inviteFor.tenancy_id,
        ...invite,
      });
      setCode(result.code);
      toast.show('Inbjudan är skapad.');
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Bestånd</div>
        <h1>{t('staff.residents')}</h1>
      </header>

      <div className="row">
        <SearchIcon size={18} />
        <Input
          aria-label="Sök hyresgäst"
          placeholder="Sök namn, e-post eller objektnummer"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.residents.length === 0,
          render: <EmptyState icon={<UserIcon size={24} />} title="Inga hyresgäster" body="Ändra sökningen för att se fler." />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th className="hide-mobile">Kontakt</th>
                  <th>Objekt</th>
                  <th className="hide-mobile">Roll</th>
                  <th className="hide-mobile">Senast inloggad</th>
                  {can('resident:write') ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.residents.map((resident) => (
                  <tr key={`${resident.id}-${resident.tenancy_id}`}>
                    <td>
                      <div className="strong">
                        {resident.first_name} {resident.last_name}
                      </div>
                      {resident.status !== 'active' ? <Pill tone="neutral">{resident.status}</Pill> : null}
                    </td>
                    <td className="hide-mobile small">
                      {resident.email}
                      {resident.phone ? <div className="xs subtle">{resident.phone}</div> : null}
                    </td>
                    <td className="small">
                      <div>{resident.object_number}</div>
                      <div className="xs subtle">
                        {resident.property_street}, lgh {resident.unit_label}
                      </div>
                    </td>
                    <td className="hide-mobile small">
                      {resident.role === 'tenant' ? 'Hyresgäst' : 'Medboende'}
                      {resident.tenancy_status === 'notice_given' ? <Pill tone="warning">Uppsagt</Pill> : null}
                    </td>
                    <td className="hide-mobile small subtle">
                      {resident.last_login_at ? relativeTime(resident.last_login_at) : 'Aldrig'}
                    </td>
                    {can('resident:write') ? (
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setInviteFor(resident);
                            setCode(null);
                            setInvite({ email: '', firstName: '', lastName: '', role: 'co_resident' });
                          }}
                        >
                          Bjud in
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

      {inviteFor ? (
        <Sheet
          title="Bjud in till appen"
          onClose={() => setInviteFor(null)}
          footer={
            code ? null : (
              <Button variant="primary" block loading={pending} disabled={!invite.email || !invite.firstName} onClick={() => void sendInvite()}>
                Skapa inbjudan
              </Button>
            )
          }
        >
          <div className="stack stack-4">
            <p className="small muted">
              Objekt {inviteFor.object_number}, {inviteFor.property_street}
            </p>
            {error ? <Banner tone="critical" title={error.message} /> : null}
            {code ? (
              <Banner tone="success" title="Inbjudningskod skapad">
                <p className="small">Koden visas bara en gång. Lämna den till hyresgästen.</p>
                <code style={{ fontSize: 'var(--text-xl)', letterSpacing: '0.1em', userSelect: 'all' }}>{code}</code>
              </Banner>
            ) : (
              <>
                <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                  <Field label="Förnamn">
                    {({ id }) => <Input id={id} value={invite.firstName} onChange={(event) => setInvite({ ...invite, firstName: event.target.value })} />}
                  </Field>
                  <Field label="Efternamn">
                    {({ id }) => <Input id={id} value={invite.lastName} onChange={(event) => setInvite({ ...invite, lastName: event.target.value })} />}
                  </Field>
                </div>
                <Field label="E-postadress">
                  {({ id }) => <Input id={id} type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} />}
                </Field>
                <Field label="Roll">
                  {({ id }) => (
                    <select className="select" id={id} value={invite.role} onChange={(event) => setInvite({ ...invite, role: event.target.value })}>
                      <option value="tenant">Hyresgäst</option>
                      <option value="co_resident">Medboende</option>
                    </select>
                  )}
                </Field>
              </>
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
