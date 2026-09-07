import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Banner, Button, LoadingBlock } from '../components/ui.js';
import { useAuth } from '../lib/auth.js';

/**
 * Landning efter federerad inloggning (krav C.2.4).
 *
 * Katalogen skickar tillbaka användaren hit med ett engångspar av token i
 * adressen. Sidan sparar dem och rensar adressfältet direkt, så att de inte
 * ligger kvar i webbläsarhistoriken.
 */
export function SsoLandingPage() {
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const accessToken = params.get('token');
    const refreshToken = params.get('refresh');
    const returnTo = params.get('returnTo');

    if (!accessToken || !refreshToken) {
      setError('Inloggningen gick inte att slutföra. Försök igen.');
      return;
    }

    // Adressen rensas innan något annat händer.
    window.history.replaceState(null, '', returnTo && returnTo.startsWith('/') ? returnTo : '/');

    signIn({ accessToken, refreshToken })
      .then(() => navigate(returnTo && returnTo.startsWith('/') ? returnTo : '/', { replace: true }))
      .catch(() => setError('Inloggningen gick inte att slutföra. Försök igen.'));
  }, [params, signIn, navigate]);

  if (error) {
    return (
      <div className="page stack stack-4">
        <Banner tone="critical" title={error} />
        <Button variant="primary" onClick={() => navigate('/logga-in', { replace: true })}>
          Till inloggningen
        </Button>
      </div>
    );
  }

  return (
    <div className="page" aria-busy="true">
      <p className="small muted">Loggar in…</p>
      <LoadingBlock rows={3} />
    </div>
  );
}
