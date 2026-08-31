import { useEffect, useState } from 'react';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS, type Locale, type MessageKey } from '@hemvist/shared';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useToast } from '../lib/toast.js';
import { Banner, Button, Field, Input, Sheet } from '../components/ui.js';
import { DownloadIcon, ShieldIcon } from '../components/icons.js';

/** Kontaktuppgifter, språk, notisinställningar och egna uppgifter. */
export function ProfilePage() {
  const { t, locale, setLocale, available } = useI18n();
  const { me, reload, signOut } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [prefs, setPrefs] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });

  useEffect(() => {
    if (!me) return;
    setForm({
      firstName: me.user.first_name,
      lastName: me.user.last_name,
      phone: me.user.phone ?? '',
      email: me.user.email,
    });
    const next: Record<string, string[]> = {};
    for (const preference of me.notificationPreferences) {
      next[preference.topic] = preference.channels ?? defaultChannels(preference.topic);
    }
    setPrefs(next);
  }, [me]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await api.patch<{ propertySystemSync: { status: string; reason?: string } }>('/api/me', {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || null,
        email: form.email,
        locale,
      });
      await reload();
      toast.show(
        result.propertySystemSync.status === 'queued'
          ? 'Uppgifterna är sparade och skickas till fastighetssystemet.'
          : 'Uppgifterna är sparade.',
      );
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const savePrefs = async (topic: string, channels: string[]) => {
    const next = { ...prefs, [topic]: channels };
    setPrefs(next);
    try {
      await api.put('/api/me/notification-preferences', {
        preferences: Object.entries(next).map(([key, value]) => ({ topic: key, channels: value })),
      });
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    }
  };

  const changePassword = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/auth/password', passwords);
      toast.show('Lösenordet är bytt. Andra enheter har loggats ut.');
      setPasswordOpen(false);
      setPasswords({ currentPassword: '', newPassword: '' });
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    try {
      const data = await api.get<unknown>('/api/me/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mina-uppgifter.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    }
  };

  if (!me) return null;

  return (
    <div className="page stack stack-6">
      <header className="page-header">
        <h1>{t('profile.title')}</h1>
        <p className="muted">
          {me.user.first_name} {me.user.last_name} · {me.organisation.display_name}
        </p>
      </header>

      <section className="stack stack-4">
        <h2 className="section-title">{t('profile.contactDetails')}</h2>
        {error ? <Banner tone="critical" title={error.message} /> : null}
        <div className="card stack stack-4">
          <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
            <Field label={t('auth.firstName')} error={error?.fieldErrors.firstName}>
              {({ id }) => <Input id={id} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />}
            </Field>
            <Field label={t('auth.lastName')} error={error?.fieldErrors.lastName}>
              {({ id }) => <Input id={id} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />}
            </Field>
          </div>
          <Field label={t('auth.email')} error={error?.fieldErrors.email}>
            {({ id }) => <Input id={id} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />}
          </Field>
          <Field label={t('auth.phone')} optional error={error?.fieldErrors.phone}>
            {({ id }) => <Input id={id} type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />}
          </Field>
          <Button variant="primary" loading={saving} onClick={() => void saveProfile()}>
            {t('common.save')}
          </Button>
        </div>
      </section>

      <section className="stack stack-3">
        <h2 className="section-title">{t('profile.language')}</h2>
        <div className="card row" style={{ gap: 'var(--space-2)' }}>
          {available.map((code) => (
            <button
              key={code}
              type="button"
              className="chip"
              aria-pressed={locale === code}
              onClick={() => setLocale(code as Locale)}
            >
              {code === 'sv' ? 'Svenska' : 'English'}
            </button>
          ))}
        </div>
      </section>

      <section className="stack stack-3">
        <h2 className="section-title">{t('profile.notifications')}</h2>
        <p className="small muted">{t('profile.notificationsHelp')}</p>
        <div className="card stack stack-3">
          {NOTIFICATION_TOPICS.map((topic) => {
            const preference = me.notificationPreferences.find((item) => item.topic === topic);
            const channels = prefs[topic] ?? [];
            return (
              <div key={topic} className="stack stack-2">
                <div className="row-between">
                  <span className="strong">{t(`topic.${topic}` as MessageKey)}</span>
                  {preference?.mandatory ? <span className="tag">Alltid på</span> : null}
                </div>
                <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      className="chip"
                      disabled={preference?.mandatory}
                      aria-pressed={channels.includes(channel)}
                      onClick={() =>
                        void savePrefs(
                          topic,
                          channels.includes(channel)
                            ? channels.filter((value) => value !== channel)
                            : [...channels, channel],
                        )
                      }
                    >
                      {t(`channel.${channel}` as MessageKey)}
                    </button>
                  ))}
                </div>
                <div className="divider" />
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack stack-3">
        <h2 className="section-title">{t('profile.security')}</h2>
        <div className="card card-flush">
          <button type="button" className="list-item" onClick={() => setPasswordOpen(true)}>
            <ShieldIcon size={18} />
            <span className="grow list-title">{t('profile.changePassword')}</span>
          </button>
          <button type="button" className="list-item" onClick={() => void exportData()}>
            <DownloadIcon size={18} />
            <span className="grow">
              <span className="list-title">{t('profile.exportData')}</span>
              <span className="list-meta">Laddar ner en fil med dina uppgifter.</span>
            </span>
          </button>
        </div>
        <Button variant="secondary" block onClick={() => void signOut()}>
          {t('common.logout')}
        </Button>
      </section>

      {passwordOpen ? (
        <Sheet
          title={t('profile.changePassword')}
          onClose={() => setPasswordOpen(false)}
          footer={
            <Button
              variant="primary"
              block
              loading={saving}
              disabled={passwords.newPassword.length < 12}
              onClick={() => void changePassword()}
            >
              {t('common.save')}
            </Button>
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            <Field label="Nuvarande lösenord">
              {({ id }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                />
              )}
            </Field>
            <Field label="Nytt lösenord" hint={t('auth.passwordRules')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={passwords.newPassword}
                  onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                />
              )}
            </Field>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

function defaultChannels(topic: string): string[] {
  if (topic === 'safety_critical') return ['inapp', 'push', 'sms'];
  if (topic === 'invoices' || topic === 'moving') return ['inapp', 'email'];
  if (topic === 'news' || topic === 'surveys') return ['inapp'];
  return ['inapp', 'push'];
}
