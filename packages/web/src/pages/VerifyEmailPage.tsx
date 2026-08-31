import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ApiError } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { Banner, LoadingBlock } from '../components/ui.js';

export function VerifyEmailPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'pending' | 'done' | 'failed'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('failed');
      setMessage('Länken saknar en giltig kod.');
      return;
    }
    api.anonymous
      .post('/api/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((error: ApiError) => {
        setState('failed');
        setMessage(error.message);
      });
  }, [token]);

  return (
    <main className="auth-page">
      <div className="auth-card stack stack-4">
        <h1>{t('auth.verifyEmail')}</h1>
        {state === 'pending' ? <LoadingBlock rows={1} /> : null}
        {state === 'done' ? <Banner tone="success" title={t('auth.verifyEmailDone')} /> : null}
        {state === 'failed' ? <Banner tone="critical" title={message} /> : null}
        <Link to="/logga-in">{t('auth.signIn')}</Link>
      </div>
    </main>
  );
}
