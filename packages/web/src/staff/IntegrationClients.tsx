import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, Button, Checkbox, Field, Input, Pill, QueryBoundary, Sheet, Textarea } from '../components/ui.js';

/**
 * Integrationskonton (krav A.1.15, C.2.12).
 *
 * Ett annat system loggar in som klient, inte som person. Kontot får bara de
 * scope det behöver, hemligheten visas en enda gång och kan bytas eller stängas
 * av utan att någon människas inloggning påverkas.
 */

interface ScopeInfo {
  scope: string;
  label: { sv: string; en: string };
  description: { sv: string; en: string };
}

interface ClientRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  scopes: string[];
  status: 'active' | 'disabled';
  secret_hint: string;
  token_ttl_seconds: number;
  expires_at: string | null;
  rotated_at: string | null;
  last_used_at: string | null;
  created_at: string;
  active_tokens: number;
}

interface Response {
  clients: ClientRow[];
  scopes: ScopeInfo[];
}

export function IntegrationClients() {
  const { can } = useAuth();
  const toast = useToast();
  const state = useQuery<Response>('/api/staff/integrations/clients');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', scopes: [] as string[] });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [issued, setIssued] = useState<{ clientId: string; clientSecret: string } | null>(null);

  const toggleScope = (scope: string) => {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((s) => s !== scope)
        : [...current.scopes, scope],
    }));
  };

  const create = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ clientId: string; clientSecret: string }>(
        '/api/staff/integrations/clients',
        {
          name: form.name,
          description: form.description || undefined,
          scopes: form.scopes,
        },
      );
      setIssued(result);
      setCreating(false);
      setForm({ name: '', description: '', scopes: [] });
      state.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  const rotate = async (row: ClientRow) => {
    try {
      const result = await api.post<{ clientId: string; clientSecret: string }>(
        `/api/staff/integrations/clients/${row.id}/rotate`,
        {},
      );
      setIssued(result);
      toast.show('Ny hemlighet skapad. Den tidigare gäller inte längre.');
      state.reload();
    } catch (caught) {
      toast.show((caught as ApiError).message);
    }
  };

  const setStatus = async (row: ClientRow, status: 'active' | 'disabled') => {
    try {
      await api.patch(`/api/staff/integrations/clients/${row.id}`, { status });
      toast.show(status === 'disabled' ? 'Kontot är avstängt.' : 'Kontot är aktivt igen.');
      state.reload();
    } catch (caught) {
      toast.show((caught as ApiError).message);
    }
  };

  return (
    <section className="stack stack-4">
      <header className="row row-between">
        <div>
          <h2 className="section-title">Integrationskonton</h2>
          <p className="small muted">
            Konton för andra system. Varje konto får bara de behörigheter som dess scope medger, och
            kan stängas av utan att någon persons inloggning påverkas.
          </p>
        </div>
        {can('integration:write') ? (
          <Button size="sm" onClick={() => { setCreating(true); setError(null); }}>
            Nytt konto
          </Button>
        ) : null}
      </header>

      {issued ? (
        <Banner tone="warning" title="Hemligheten visas bara nu">
          <p className="small">
            Spara den på ett säkert ställe. Den går inte att läsa igen — bara att byta ut.
          </p>
          <p className="small trace" style={{ marginTop: 'var(--space-2)' }}>
            Klient-id: {issued.clientId}
          </p>
          <p className="small trace" style={{ wordBreak: 'break-all' }}>
            Hemlighet: {issued.clientSecret}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
            Jag har sparat den
          </Button>
        </Banner>
      ) : null}

      <QueryBoundary state={state} loadingRows={3}>
        {(data) => (
          <>
            {data.clients.length === 0 ? (
              <div className="card">
                <p className="small muted">Inga integrationskonton är upplagda ännu.</p>
              </div>
            ) : (
              <div className="card card-flush">
                {data.clients.map((row) => (
                  <div className="integration-row" key={row.id}>
                    <div className="grow">
                      <div className="strong">{row.name}</div>
                      <div className="small muted trace">{row.client_id}</div>
                      {row.description ? <div className="xs subtle">{row.description}</div> : null}
                      <div className="xs subtle">
                        Scope: {row.scopes.join(', ') || 'inga'} · hemlighet slutar på {row.secret_hint}
                        {row.rotated_at ? ` · bytt ${formatDateTime(row.rotated_at)}` : ''}
                      </div>
                      <div className="xs subtle">
                        {row.active_tokens} giltiga token
                        {row.last_used_at ? ` · senast använt ${formatDateTime(row.last_used_at)}` : ' · aldrig använt'}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <Pill tone={row.status === 'active' ? 'success' : 'critical'}>
                        {row.status === 'active' ? 'Aktivt' : 'Avstängt'}
                      </Pill>
                      {can('integration:write') ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => void rotate(row)}>
                            Byt hemlighet
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void setStatus(row, row.status === 'active' ? 'disabled' : 'active')}
                          >
                            {row.status === 'active' ? 'Stäng av' : 'Aktivera'}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {creating ? (
              <Sheet
                title="Nytt integrationskonto"
                onClose={() => setCreating(false)}
                footer={
                  <Button
                    variant="primary"
                    block
                    loading={pending}
                    disabled={!form.name || form.scopes.length === 0}
                    onClick={() => void create()}
                  >
                    Skapa konto
                  </Button>
                }
              >
                <div className="stack stack-4">
                  {error ? <Banner tone="critical" title={error.message} /> : null}
                  <Field label="Namn" hint="Vilket system det är, till exempel Vitec fastighetssystem.">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Beskrivning" optional>
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={2}
                        value={form.description}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                      />
                    )}
                  </Field>
                  <div className="stack stack-2">
                    <div className="section-title">Behörigheter</div>
                    <p className="xs subtle">Ge bara det systemet faktiskt behöver.</p>
                    {data.scopes.map((scope) => (
                      <Checkbox
                        key={scope.scope}
                        checked={form.scopes.includes(scope.scope)}
                        onChange={() => toggleScope(scope.scope)}
                        label={scope.label.sv}
                        description={scope.description.sv}
                      />
                    ))}
                  </div>
                </div>
              </Sheet>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
