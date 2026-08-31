import { useState } from 'react';
import { ROLES, type Role } from '@hemvist/shared';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { relativeTime } from '../lib/format.js';
import { Banner, Button, Field, Input, Pill, QueryBoundary, Sheet } from '../components/ui.js';
import { PlusIcon, UserIcon } from '../components/icons.js';
import { EmptyState } from '../components/ui.js';

interface StaffUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  last_login_at: string | null;
  mfa_enabled: boolean;
  roles: Role[];
  area_ids: string[];
  property_ids: string[];
}

const ROLE_LABEL: Record<string, string> = {
  tenant: 'Hyresgäst',
  co_resident: 'Medboende',
  property_manager: 'Fastighetsförvaltare',
  customer_service: 'Kundservice',
  caretaker: 'Fastighetsskötare',
  technician: 'Tekniker',
  letting_agent: 'Uthyrare',
  area_manager: 'Områdeschef',
  admin: 'Administratör',
  contractor: 'Entreprenör',
  superadmin: 'Superadministratör',
};

const ASSIGNABLE = ROLES.filter((role) => role !== 'tenant' && role !== 'co_resident');

/** Användare, roller och behörighetsavgränsning (krav A.7.3, A.7.4). */
export function UsersPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const state = useQuery<{ users: StaffUser[] }>('/api/staff/users');
  const structure = useQuery<{ areas: { id: string; name: string; properties: { id: string; name: string }[] }[] }>(
    '/api/staff/structure',
  );
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', roles: ['customer_service'] as string[], areaIds: [] as string[] });
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ temporaryPassword: string }>('/api/staff/users', {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        roles: form.roles,
        areaIds: form.areaIds,
        propertyIds: [],
      });
      setTemporaryPassword(result.temporaryPassword);
      toast.show('Användaren är skapad.');
      state.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (user: StaffUser) => {
    try {
      await api.patch(`/api/staff/users/${user.id}`, { active: user.status !== 'active' });
      toast.show(user.status === 'active' ? 'Kontot är spärrat.' : 'Kontot är aktiverat.');
      state.reload();
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header row-between">
        <div>
          <div className="eyebrow">Administration</div>
          <h1>{t('staff.users')}</h1>
        </div>
        {can('user:write') ? (
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => { setCreating(true); setTemporaryPassword(null); setError(null); }}>
            Ny användare
          </Button>
        ) : null}
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.users.length === 0,
          render: <EmptyState icon={<UserIcon size={24} />} title="Inga användare" />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Namn</th>
                  <th className="hide-mobile">E-post</th>
                  <th>Roller</th>
                  <th>Tvåfaktor</th>
                  <th className="hide-mobile">Senast inloggad</th>
                  {can('user:write') ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="strong">
                        {user.first_name} {user.last_name}
                      </div>
                      {user.status !== 'active' ? <Pill tone="neutral">Spärrat</Pill> : null}
                    </td>
                    <td className="hide-mobile small">{user.email}</td>
                    <td className="small">{user.roles.map((role) => ROLE_LABEL[role] ?? role).join(', ')}</td>
                    <td>
                      {user.mfa_enabled ? <Pill tone="success">Aktiv</Pill> : <Pill tone="warning">Saknas</Pill>}
                    </td>
                    <td className="hide-mobile small subtle">
                      {user.last_login_at ? relativeTime(user.last_login_at) : 'Aldrig'}
                    </td>
                    {can('user:write') ? (
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => void toggleActive(user)}>
                          {user.status === 'active' ? 'Spärra' : 'Aktivera'}
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

      {creating ? (
        <Sheet
          title="Ny användare"
          onClose={() => setCreating(false)}
          footer={
            temporaryPassword ? null : (
              <Button variant="primary" block loading={pending} disabled={!form.email || !form.firstName} onClick={() => void create()}>
                {t('common.create')}
              </Button>
            )
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            {temporaryPassword ? (
              <Banner tone="success" title="Användaren är skapad">
                <p className="small">
                  Tillfälligt lösenord, visas bara en gång. Kontot kräver tvåfaktorsautentisering vid
                  första inloggningen.
                </p>
                <code style={{ fontSize: 'var(--text-lg)', userSelect: 'all' }}>{temporaryPassword}</code>
              </Banner>
            ) : (
              <>
                <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                  <Field label="Förnamn" error={error?.fieldErrors.firstName}>
                    {({ id }) => <Input id={id} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />}
                  </Field>
                  <Field label="Efternamn" error={error?.fieldErrors.lastName}>
                    {({ id }) => <Input id={id} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />}
                  </Field>
                </div>
                <Field label="E-post" error={error?.fieldErrors.email}>
                  {({ id }) => <Input id={id} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}
                </Field>
                <Field label="Telefon" optional>
                  {({ id }) => <Input id={id} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />}
                </Field>
                <fieldset>
                  <legend>Roller</legend>
                  <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                    {ASSIGNABLE.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className="chip"
                        aria-pressed={form.roles.includes(role)}
                        onClick={() =>
                          setForm({
                            ...form,
                            roles: form.roles.includes(role) ? form.roles.filter((value) => value !== role) : [...form.roles, role],
                          })
                        }
                      >
                        {ROLE_LABEL[role] ?? role}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Behörighet till område</legend>
                  <p className="small muted">
                    Utan val ser användaren hela beståndet om rollen tillåter det. Annars begränsas
                    åtkomsten till valda områden.
                  </p>
                  <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                    {(structure.data?.areas ?? []).map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        className="chip"
                        aria-pressed={form.areaIds.includes(area.id)}
                        onClick={() =>
                          setForm({
                            ...form,
                            areaIds: form.areaIds.includes(area.id)
                              ? form.areaIds.filter((value) => value !== area.id)
                              : [...form.areaIds, area.id],
                          })
                        }
                      >
                        {area.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
