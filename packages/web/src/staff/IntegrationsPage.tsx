import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, Button, Field, Input, Pill, QueryBoundary, Sheet, Textarea } from '../components/ui.js';
import { LinkIcon } from '../components/icons.js';

interface Integration {
  id: string;
  kind: string;
  name: string;
  status: 'connected' | 'requires_configuration' | 'sandbox' | 'disconnected' | 'planned';
  base_url: string | null;
  notes: string | null;
  last_check_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  has_credentials: boolean;
  recentActivity: { calls: number; failures: number; last_call_at: string | null };
}

const STATUS_TONE: Record<Integration['status'], 'success' | 'warning' | 'info' | 'neutral' | 'critical'> = {
  connected: 'success',
  sandbox: 'info',
  requires_configuration: 'warning',
  disconnected: 'critical',
  planned: 'neutral',
};

const KIND_LABEL: Record<string, string> = {
  property_system: 'Fastighetssystem',
  finance: 'Ekonomisystem',
  rent_invoicing: 'Hyresavisering',
  payments: 'Betalningar',
  e_signing: 'Digital signering',
  access_control: 'Passersystem',
  digital_locks: 'Digitala lås',
  booking: 'Bokningssystem',
  email: 'E-post',
  sms: 'SMS',
  push: 'Pushnotiser',
  maps: 'Kartor',
  customer_service: 'Kundservice',
  contractor_system: 'Entreprenörssystem',
  identity: 'Identitetsverifiering',
  bankid: 'BankID',
  calendar: 'Externa kalendrar',
  metering: 'Mätvärden',
  sso: 'Federerad inloggning',
  file_scanning: 'Säkerhetsgranskning av bilagor',
};

/**
 * Integrationsregistret.
 *
 * Statusen speglar verklig konfiguration. En integration kan inte markeras som
 * ansluten förrän adress och autentiseringsuppgifter finns – servern avvisar
 * försöket, så listan kan inte visa en anslutning som inte existerar.
 */
export function IntegrationsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const state = useQuery<{ integrations: Integration[] }>('/api/staff/integrations');
  const [editing, setEditing] = useState<Integration | null>(null);
  const [form, setForm] = useState({ status: '', baseUrl: '', notes: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const save = async () => {
    if (!editing) return;
    setPending(true);
    setError(null);
    try {
      await api.patch(`/api/staff/integrations/${editing.id}`, {
        status: form.status,
        baseUrl: form.baseUrl || null,
        notes: form.notes || undefined,
      });
      toast.show('Integrationen är uppdaterad.');
      setEditing(null);
      state.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Administration</div>
        <h1>{t('staff.integrations')}</h1>
        <p className="muted">
          Statusen visar den faktiska anslutningen. Funktioner som kräver en integration är avstängda
          i appen tills den är ansluten.
        </p>
      </header>

      <QueryBoundary state={state} loadingRows={5}>
        {(data) => (
          <div className="card card-flush">
            {data.integrations.map((integration) => (
              <div className="integration-row" key={integration.id}>
                <LinkIcon size={18} />
                <div className="grow">
                  <div className="strong">{integration.name}</div>
                  <div className="small muted">
                    {KIND_LABEL[integration.kind] ?? integration.kind}
                    {integration.base_url ? ` · ${integration.base_url}` : ''}
                  </div>
                  {integration.notes ? <div className="xs subtle">{integration.notes}</div> : null}
                  {integration.recentActivity.calls > 0 ? (
                    <div className="xs subtle">
                      {integration.recentActivity.calls} anrop senaste veckan
                      {integration.recentActivity.failures > 0 ? `, varav ${integration.recentActivity.failures} fel` : ''}
                      {integration.recentActivity.last_call_at ? ` · senast ${formatDateTime(integration.recentActivity.last_call_at)}` : ''}
                    </div>
                  ) : null}
                  {integration.last_error ? (
                    <div className="xs" style={{ color: 'var(--status-critical)' }}>
                      {integration.last_error}
                    </div>
                  ) : null}
                </div>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  {!integration.has_credentials && integration.status !== 'planned' ? (
                    <span className="tag">Uppgifter saknas</span>
                  ) : null}
                  <Pill tone={STATUS_TONE[integration.status]}>
                    {t(`integration.${integration.status}` as 'integration.connected')}
                  </Pill>
                  {can('integration:write') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(integration);
                        setForm({
                          status: integration.status,
                          baseUrl: integration.base_url ?? '',
                          notes: integration.notes ?? '',
                        });
                        setError(null);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </QueryBoundary>

      {editing ? (
        <Sheet
          title={editing.name}
          onClose={() => setEditing(null)}
          footer={
            <Button variant="primary" block loading={pending} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            {!editing.has_credentials ? (
              <Banner tone="info" title="Autentiseringsuppgifter saknas">
                <p className="small">
                  Nycklar och lösenord lagras i plattformens hemlighetshanterare och registreras av
                  driftansvarig, inte här. Integrationen kan därför inte sättas till Ansluten från
                  det här gränssnittet förrän uppgifterna finns på plats.
                </p>
              </Banner>
            ) : null}
            <Field label="Status">
              {({ id }) => (
                <select className="select" id={id} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="connected">Ansluten</option>
                  <option value="sandbox">Testmiljö</option>
                  <option value="requires_configuration">Kräver konfiguration</option>
                  <option value="disconnected">Frånkopplad</option>
                  <option value="planned">Planerad</option>
                </select>
              )}
            </Field>
            <Field label="Adress" optional hint="Bastjänstens adress, till exempel https://api.leverantor.se">
              {({ id }) => <Input id={id} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />}
            </Field>
            <Field label="Anteckning" optional>
              {({ id }) => <Textarea id={id} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />}
            </Field>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
