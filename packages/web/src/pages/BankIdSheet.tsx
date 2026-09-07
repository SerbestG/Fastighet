import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { Banner, Button, Sheet } from '../components/ui.js';

/**
 * Inloggning med BankID (krav C.2.1).
 *
 * QR-koden byts varje sekund enligt BankID:s specifikation, så att en
 * avfotograferad kod inte går att använda någon annanstans. På mobil används
 * autostart i stället, som öppnar BankID-appen direkt.
 */

interface StartResponse {
  ref: string;
  autoStartToken: string;
  qr: string;
  mode: 'live' | 'simulator';
}

interface CollectResponse {
  status: 'pending' | 'complete' | 'failed' | 'cancelled';
  hintCode: string | null;
  session: { accessToken: string; refreshToken: string } | null;
}

/** Texterna följer BankID:s rekommenderade meddelanden. */
const HINTS: Record<string, string> = {
  outstandingTransaction: 'Starta BankID-appen.',
  noClient: 'Starta BankID-appen.',
  started: 'Söker efter BankID. Har du inget BankID går det att beställa hos din bank.',
  userSign: 'Skriv in din säkerhetskod i BankID-appen och välj Legitimera.',
  userMrtd: 'Följ anvisningarna i BankID-appen.',
  userCallConfirm: 'Bekräfta i BankID-appen.',
  expiredTransaction: 'BankID-appen svarade inte i tid. Försök igen.',
  certificateErr: 'Det BankID du försöker använda går inte att använda här.',
  userCancel: 'Du avbröt legitimeringen.',
  cancelled: 'Legitimeringen avbröts.',
  startFailed: 'Legitimeringen kunde inte startas. Försök igen.',
  transport: 'Kontakten med BankID bröts. Försök igen.',
};

interface Props {
  orgSlug: string;
  /** Endast i simulatorläge: personnummer som demoinloggningen ska använda. */
  demoPersonalNumber?: string;
  onClose: () => void;
}

export function BankIdSheet({ orgSlug, demoPersonalNumber, onClose }: Props) {
  const { signIn } = useAuth();
  const [start, setStart] = useState<StartResponse | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [hint, setHint] = useState<string>('Startar BankID…');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const active = useRef(true);

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const fail = useCallback((message: string) => {
    if (!active.current) return;
    setError(message);
  }, []);

  // Startar ordern när panelen öppnas.
  useEffect(() => {
    active.current = true;
    api.anonymous
      .post<StartResponse>('/api/auth/bankid/start', {
        org: orgSlug,
        demoPersonalNumber,
      })
      .then((response) => {
        if (!active.current) return;
        setStart(response);
        setHint(HINTS.outstandingTransaction!);
      })
      .catch((caught) => fail((caught as ApiError).message));

    return () => {
      active.current = false;
    };
  }, [orgSlug, demoPersonalNumber, fail]);

  // Ritar om QR-koden varje sekund så länge ordern är öppen.
  useEffect(() => {
    if (!start || done || error || isMobile) return;
    let cancelled = false;

    const draw = async (value: string) => {
      const dataUrl = await QRCode.toDataURL(value, { margin: 1, width: 232 });
      if (!cancelled) setQrImage(dataUrl);
    };

    void draw(start.qr);
    const timer = window.setInterval(() => {
      api.anonymous
        .get<{ qr: string | null }>(`/api/auth/bankid/qr?ref=${encodeURIComponent(start.ref)}`)
        .then((response) => {
          if (response.qr) void draw(response.qr);
        })
        .catch(() => {
          /* Nästa hämtning får försöka igen. */
        });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [start, done, error, isMobile]);

  // Frågar servern om status tills ordern är avgjord.
  useEffect(() => {
    if (!start || done || error) return;
    const timer = window.setInterval(() => {
      api.anonymous
        .post<CollectResponse>('/api/auth/bankid/collect', { ref: start.ref })
        .then(async (response) => {
          if (!active.current) return;
          if (response.status === 'pending') {
            setHint(HINTS[response.hintCode ?? ''] ?? 'Legitimera dig i BankID-appen.');
            return;
          }
          if (response.status === 'complete' && response.session) {
            setDone(true);
            await signIn(response.session);
            return;
          }
          fail(HINTS[response.hintCode ?? ''] ?? 'Legitimeringen kunde inte slutföras.');
        })
        .catch((caught) => fail((caught as ApiError).message));
    }, 2000);

    return () => window.clearInterval(timer);
  }, [start, done, error, signIn, fail]);

  const cancel = () => {
    active.current = false;
    if (start) {
      void api.anonymous.post('/api/auth/bankid/cancel', { ref: start.ref }).catch(() => {
        /* Ordern löper ut av sig själv. */
      });
    }
    onClose();
  };

  return (
    <Sheet title="Logga in med BankID" onClose={cancel}>
      <div className="stack stack-4 center">
        {start?.mode === 'simulator' ? (
          <Banner tone="warning" title="Simulator, ingen verklig legitimering">
            <p className="small">
              BankID är inte anslutet i den här miljön. Flödet visas som det kommer att fungera, men
              ingen identitet kontrolleras.
            </p>
          </Banner>
        ) : null}

        {error ? (
          <>
            <Banner tone="critical" title={error} />
            <Button variant="secondary" onClick={cancel}>
              Stäng
            </Button>
          </>
        ) : done ? (
          <p className="small">Legitimeringen är klar. Loggar in…</p>
        ) : (
          <>
            {isMobile && start ? (
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => {
                  window.location.href = `bankid:///?autostarttoken=${start.autoStartToken}&redirect=null`;
                }}
              >
                Öppna BankID-appen
              </Button>
            ) : qrImage ? (
              <img
                src={qrImage}
                width={232}
                height={232}
                alt="QR-kod att läsa av i BankID-appen"
                style={{ borderRadius: 'var(--radius-md)' }}
              />
            ) : (
              <div className="skeleton" style={{ width: 232, height: 232 }} />
            )}
            <p className="small" role="status" aria-live="polite">
              {hint}
            </p>
            <Button variant="ghost" onClick={cancel}>
              Avbryt
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
