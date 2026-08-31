import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiError } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { Banner, Button, Field, Input } from '../components/ui.js';

interface PublicOrg {
  slug: string;
  display_name: string;
}

/** Kontot kopplas till rätt hyresobjekt med en inbjudningskod från hyresvärden. */
export function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [organisations, setOrganisations] = useState<PublicOrg[]>([]);
  const [form, setForm] = useState({
    orgSlug: '',
    invitationCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ verificationToken?: string } | null>(null);

  useEffect(() => {
    api.anonymous
      .get<{ organisations: PublicOrg[] }>('/api/public/organisations')
      .then((data) => {
        setOrganisations(data.organisations);
        if (data.organisations.length === 1) {
          setForm((current) => ({ ...current, orgSlug: data.organisations[0]!.slug }));
        }
      })
      .catch(() => setOrganisations([]));
  }, []);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api.anonymous.post<{ verificationToken?: string }>('/api/auth/register', {
        ...form,
        phone: form.phone || undefined,
        invitationCode: form.invitationCode.trim().toUpperCase(),
      });
      setDone(result);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <main className="auth-page">
        <div className="auth-card stack stack-4">
          <h1>{t('auth.verifyEmail')}</h1>
          <p className="muted">{t('auth.verifyEmailSent')}</p>
          {done.verificationToken ? (
            <Banner tone="info" title="Utvecklingsläge">
              <p className="small">
                E-postintegrationen är inte konfigurerad, så länken visas här i stället för att
                skickas.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/bekrafta-epost?token=${done.verificationToken}`)}
              >
                Bekräfta nu
              </Button>
            </Banner>
          ) : null}
          <Link to="/logga-in">{t('auth.signIn')}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card stack stack-4" onSubmit={submit}>
        <div>
          <h1>{t('auth.register')}</h1>
          <p className="muted">Koden kopplar kontot till din bostad.</p>
        </div>

        {error ? <Banner tone="critical" title={error.message} /> : null}

        {organisations.length > 1 ? (
          <Field label="Bolag" error={error?.fieldErrors.orgSlug}>
            {({ id }) => (
              <select className="select" id={id} value={form.orgSlug} onChange={update('orgSlug')} required>
                <option value="">Välj bolag</option>
                {organisations.map((org) => (
                  <option key={org.slug} value={org.slug}>
                    {org.display_name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}

        <Field
          label={t('auth.invitationCode')}
          hint={t('auth.invitationCodeHelp')}
          error={error?.fieldErrors.invitationCode}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={form.invitationCode}
              onChange={update('invitationCode')}
              autoComplete="one-time-code"
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
              required
            />
          )}
        </Field>

        <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
          <Field label={t('auth.firstName')} error={error?.fieldErrors.firstName}>
            {({ id }) => <Input id={id} value={form.firstName} onChange={update('firstName')} autoComplete="given-name" required />}
          </Field>
          <Field label={t('auth.lastName')} error={error?.fieldErrors.lastName}>
            {({ id }) => <Input id={id} value={form.lastName} onChange={update('lastName')} autoComplete="family-name" required />}
          </Field>
        </div>

        <Field label={t('auth.email')} error={error?.fieldErrors.email}>
          {({ id }) => <Input id={id} type="email" value={form.email} onChange={update('email')} autoComplete="email" required />}
        </Field>

        <Field label={t('auth.phone')} optional error={error?.fieldErrors.phone}>
          {({ id }) => <Input id={id} type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" />}
        </Field>

        <Field label={t('auth.password')} hint={t('auth.passwordRules')} error={error?.fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="password"
              value={form.password}
              onChange={update('password')}
              autoComplete="new-password"
              minLength={12}
              required
            />
          )}
        </Field>

        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t('auth.register')}
        </Button>
        <p className="small center">
          Har du redan ett konto? <Link to="/logga-in">{t('auth.signIn')}</Link>
        </p>
      </form>
    </main>
  );
}
