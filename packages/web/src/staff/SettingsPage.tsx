import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { Banner, Button, Checkbox, Field, Input, QueryBoundary } from '../components/ui.js';

interface Settings {
  organisation: {
    id: string;
    display_name: string;
    primary_color: string;
    accent_color: string;
    support_email: string | null;
    support_phone: string | null;
    emergency_phone: string | null;
    disturbance_phone: string | null;
    website_url: string | null;
    default_locale: string;
    terminology: Record<string, string>;
    enabled_features: string[];
  };
  retentionPolicies: { entity: string; retain_days: number; action: string; description: string | null; active: boolean }[];
}

const FEATURES: { key: string; label: string; description: string }[] = [
  { key: 'cases', label: 'Felanmälan och ärenden', description: 'Hyresgästen kan skapa och följa ärenden.' },
  { key: 'bookings', label: 'Bokning', description: 'Tvättstuga, lokaler och besök.' },
  { key: 'invoices', label: 'Hyresavier', description: 'Avier och betalstatus.' },
  { key: 'documents', label: 'Dokument', description: 'Avtal, protokoll och ordningsregler.' },
  { key: 'notices', label: 'Driftinformation och nyheter', description: 'Riktade inlägg.' },
  { key: 'messages', label: 'Meddelanden', description: 'Dialog med förvaltningen.' },
  { key: 'my_home', label: 'Mitt boende', description: 'Uppgifter om bostaden.' },
  { key: 'moving', label: 'Flytt', description: 'Checklistor för in- och utflyttning.' },
  { key: 'surveys', label: 'Enkäter', description: 'Boendeenkäter och återkoppling.' },
  { key: 'area', label: 'Området', description: 'Lokal information och tjänster.' },
  { key: 'access', label: 'Nycklar och passage', description: 'Passagepunkter och behörigheter.' },
];

const TERMS: { key: string; label: string; fallback: string }[] = [
  { key: 'case', label: 'Felanmälan', fallback: 'Felanmälan' },
  { key: 'caretaker', label: 'Fastighetsskötare', fallback: 'Bovärd' },
  { key: 'area', label: 'Område', fallback: 'Område' },
];

/** Profil, begrepp och vilka moduler hyresgästerna ska se (krav A.2.1, A.2.11, B.1.11). */
export function SettingsPage() {
  const { t } = useI18n();
  const { reload } = useAuth();
  const toast = useToast();
  const state = useQuery<Settings>('/api/staff/settings');
  const [form, setForm] = useState<Settings['organisation'] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (state.data) setForm(state.data.organisation);
  }, [state.data]);

  const save = async () => {
    if (!form) return;
    setPending(true);
    setError(null);
    try {
      await api.patch('/api/staff/settings', {
        displayName: form.display_name,
        primaryColor: form.primary_color,
        accentColor: form.accent_color,
        supportEmail: form.support_email ?? undefined,
        supportPhone: form.support_phone ?? undefined,
        emergencyPhone: form.emergency_phone ?? undefined,
        disturbancePhone: form.disturbance_phone ?? undefined,
        websiteUrl: form.website_url ?? undefined,
        terminology: form.terminology,
        enabledFeatures: form.enabled_features,
      });
      await reload();
      toast.show('Inställningarna är sparade.');
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
        <h1>{t('staff.settings')}</h1>
      </header>

      <QueryBoundary state={state}>
        {(data) =>
          form ? (
            <div className="stack stack-6">
              {error ? <Banner tone="critical" title={error.message} /> : null}

              <section className="card stack stack-4">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Profil
                </h2>
                <Field label="Namn som visas i appen">
                  {({ id }) => <Input id={id} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} />}
                </Field>
                <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                  <Field label="Primärfärg" hint="Används på knappar och rubriker.">
                    {({ id }) => (
                      <div className="row">
                        <input
                          id={id}
                          type="color"
                          value={form.primary_color}
                          onChange={(event) => setForm({ ...form, primary_color: event.target.value })}
                          style={{ width: '3rem', height: '2.75rem', border: 0, background: 'none' }}
                        />
                        <Input value={form.primary_color} onChange={(event) => setForm({ ...form, primary_color: event.target.value })} />
                      </div>
                    )}
                  </Field>
                  <Field label="Accentfärg" hint="Används för markeringar och fokus.">
                    {({ id }) => (
                      <div className="row">
                        <input
                          id={id}
                          type="color"
                          value={form.accent_color}
                          onChange={(event) => setForm({ ...form, accent_color: event.target.value })}
                          style={{ width: '3rem', height: '2.75rem', border: 0, background: 'none' }}
                        />
                        <Input value={form.accent_color} onChange={(event) => setForm({ ...form, accent_color: event.target.value })} />
                      </div>
                    )}
                  </Field>
                </div>
              </section>

              <section className="card stack stack-4">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Kontaktvägar
                </h2>
                <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                  <Field label="Kundservice, telefon">
                    {({ id }) => <Input id={id} value={form.support_phone ?? ''} onChange={(event) => setForm({ ...form, support_phone: event.target.value })} />}
                  </Field>
                  <Field label="Kundservice, e-post">
                    {({ id }) => <Input id={id} type="email" value={form.support_email ?? ''} onChange={(event) => setForm({ ...form, support_email: event.target.value })} />}
                  </Field>
                  <Field label="Fastighetsjour">
                    {({ id }) => <Input id={id} value={form.emergency_phone ?? ''} onChange={(event) => setForm({ ...form, emergency_phone: event.target.value })} />}
                  </Field>
                  <Field label="Störningsjour">
                    {({ id }) => (
                      <Input id={id} value={form.disturbance_phone ?? ''} onChange={(event) => setForm({ ...form, disturbance_phone: event.target.value })} />
                    )}
                  </Field>
                </div>
                <Field label="Webbplats" optional>
                  {({ id }) => <Input id={id} value={form.website_url ?? ''} onChange={(event) => setForm({ ...form, website_url: event.target.value })} />}
                </Field>
              </section>

              <section className="card stack stack-4">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Begrepp mot kund
                </h2>
                <p className="small muted">
                  Ändra vad funktionerna heter i appen så att de stämmer med era egna ord.
                </p>
                {TERMS.map((term) => (
                  <Field key={term.key} label={term.label}>
                    {({ id }) => (
                      <Input
                        id={id}
                        value={form.terminology[term.key] ?? ''}
                        placeholder={term.fallback}
                        onChange={(event) =>
                          setForm({ ...form, terminology: { ...form.terminology, [term.key]: event.target.value } })
                        }
                      />
                    )}
                  </Field>
                ))}
              </section>

              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Funktioner i appen
                </h2>
                <p className="small muted">Välj vilka delar hyresgästerna ska se.</p>
                {FEATURES.map((feature) => (
                  <Checkbox
                    key={feature.key}
                    checked={form.enabled_features.includes(feature.key)}
                    onChange={(checked) =>
                      setForm({
                        ...form,
                        enabled_features: checked
                          ? [...form.enabled_features, feature.key]
                          : form.enabled_features.filter((value) => value !== feature.key),
                      })
                    }
                    label={feature.label}
                    description={feature.description}
                  />
                ))}
              </section>

              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Gallring
                </h2>
                <p className="small muted">
                  Bakgrundsjobbet gallrar enligt reglerna nedan. Ändringar görs av systemförvaltningen.
                </p>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Datatyp</th>
                        <th className="num">Sparas</th>
                        <th>Åtgärd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.retentionPolicies.map((policy) => (
                        <tr key={policy.entity}>
                          <td>
                            <div className="strong">{policy.entity}</div>
                            <div className="xs subtle">{policy.description}</div>
                          </td>
                          <td className="num">{policy.retain_days} dagar</td>
                          <td className="small">{policy.action === 'delete' ? 'Raderas' : 'Anonymiseras'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <Button variant="primary" loading={pending} onClick={() => void save()}>
                {t('common.save')}
              </Button>
            </div>
          ) : null
        }
      </QueryBoundary>
    </div>
  );
}
