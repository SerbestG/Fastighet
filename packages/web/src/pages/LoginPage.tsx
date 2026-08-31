import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { Banner, Button, Field, Input } from '../components/ui.js';

interface PublicOrg {
  slug: string;
  display_name: string;
  primary_color: string;
  accent_color?: string;
  support_phone?: string | null;
  emergency_phone?: string | null;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  error?: { code: string; message: string };
  mfaSetup?: { setupToken: string; secret: string; otpauthUri: string };
}

/**
 * Inloggning.
 *
 * Personalkonton kräver engångskod. BankID och organisationsinloggning visas
 * bara när respektive integration faktiskt är ansluten – annars vore knappen
 * ett löfte tjänsten inte kan hålla.
 */
export function LoginPage() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [params] = useSearchParams();

  const [organisations, setOrganisations] = useState<PublicOrg[]>([]);
  const [orgSlug, setOrgSlug] = useState(params.get('bolag') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<LoginResponse['mfaSetup'] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api.anonymous
      .get<{ organisations: PublicOrg[] }>('/api/public/organisations')
      .then((data) => {
        setOrganisations(data.organisations);
        if (data.organisations.length === 1) setOrgSlug(data.organisations[0]!.slug);
      })
      .catch(() => setOrganisations([]));
  }, []);

  const selected = organisations.find((org) => org.slug === orgSlug);

  useEffect(() => {
    if (selected) {
      document.documentElement.style.setProperty('--brand-primary', selected.primary_color);
    }
  }, [selected]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { email, password };
      if (orgSlug) body.orgSlug = orgSlug;
      if (totp) body.totp = totp;
      const result = await api.anonymous.post<LoginResponse>('/api/auth/login', body);
      await signIn({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === 'mfa_required') {
        setNeedsTotp(true);
        setError(null);
      } else if (apiError.code === 'mfa_setup_required') {
        // Servern skickar med uppgifterna som behövs för att aktivera tvåfaktor.
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password, orgSlug: orgSlug || undefined }),
          });
          const data = (await response.json()) as LoginResponse;
          if (data.mfaSetup) setMfaSetup(data.mfaSetup);
        } catch {
          setError(apiError);
        }
      } else {
        setError(apiError);
      }
    } finally {
      setPending(false);
    }
  };

  const enrollMfa = async (event: FormEvent) => {
    event.preventDefault();
    if (!mfaSetup) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.anonymous.post<{ accessToken: string; refreshToken: string }>(
        '/api/auth/mfa/enroll',
        { setupToken: mfaSetup.setupToken, totp },
      );
      await signIn(result);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  if (mfaSetup) {
    return (
      <main className="auth-page">
        <form className="auth-card stack stack-4" onSubmit={enrollMfa}>
          <div>
            <h1>{t('auth.mfaSetupTitle')}</h1>
            <p className="muted">{t('auth.mfaSetupBody')}</p>
          </div>
          <div className="card" style={{ background: 'var(--surface-sunken)' }}>
            <p className="small muted" style={{ marginBottom: 'var(--space-2)' }}>
              Lägg till kontot i din autentiseringsapp med den här nyckeln:
            </p>
            <code style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all', userSelect: 'all' }}>
              {mfaSetup.secret}
            </code>
          </div>
          <Field label={t('auth.totp')} hint={t('auth.totpHelp')} error={error?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totp}
                onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
                required
              />
            )}
          </Field>
          <Button type="submit" variant="primary" block loading={pending}>
            Aktivera och logga in
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form className="auth-card stack stack-4" onSubmit={submit}>
        <div>
          <div className="auth-logo" aria-hidden="true">
            {(selected?.display_name ?? 'H').slice(0, 1)}
          </div>
          <h1>{selected ? selected.display_name : t('common.appName')}</h1>
          <p className="muted">Appen för ditt boende.</p>
        </div>

        {error ? (
          <Banner tone="critical" title={error.message}>
            {error.traceId ? <span className="trace">ID: {error.traceId}</span> : null}
          </Banner>
        ) : null}

        {organisations.length > 1 ? (
          <Field label="Bolag">
            {({ id }) => (
              <select className="select" id={id} value={orgSlug} onChange={(event) => setOrgSlug(event.target.value)}>
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

        <Field label={t('auth.email')} error={error?.fieldErrors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          )}
        </Field>

        <Field label={t('auth.password')} error={error?.fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          )}
        </Field>

        {needsTotp ? (
          <Field label={t('auth.totp')} hint={t('auth.totpHelp')}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totp}
                onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            )}
          </Field>
        ) : null}

        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t('auth.signIn')}
        </Button>

        {/*
          BankID och federerad inloggning kräver avtal, certifikat och
          konfiguration. Knapparna visas först när integrationen är ansluten,
          så att appen inte utlovar ett inloggningssätt som inte fungerar.
        */}
        <p className="small muted center">
          Inloggning med BankID och organisationskonto aktiveras när respektive integration är
          ansluten.
        </p>

        <div className="divider" />
        <p className="small center">
          Har du en inbjudningskod? <Link to="/skapa-konto">{t('auth.register')}</Link>
        </p>
        {selected?.emergency_phone ? (
          <p className="small muted center">
            Akut fel utanför kontorstid: <a href={`tel:${selected.emergency_phone}`}>{selected.emergency_phone}</a>
          </p>
        ) : null}
      </form>
    </main>
  );
}
