import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { Banner, Button, Field, Input, Sheet } from '../components/ui.js';

/**
 * Hyresgästen bjuder in en medboende (krav B.1.1, B.1.2).
 *
 * Koden visas här och lämnas vidare av hyresgästen själv. Den skickas inte med
 * e-post, eftersom e-postutskick kräver en integration som inte är ansluten —
 * och en kod som aldrig kommer fram vore värre än ingen kod alls.
 */
export function InviteCoResident({
  tenancyId,
  alreadyInvited,
}: {
  tenancyId: string;
  alreadyInvited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const invite = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ code: string; expiresInDays: number }>(
        '/api/me/invite-co-resident',
        { tenancyId, email: email || undefined },
      );
      setCode(result.code);
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  if (alreadyInvited) {
    return (
      <p className="xs subtle">
        Du kan bjuda in en medboende per bostad, och en är redan registrerad.
      </p>
    );
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => { setOpen(true); setCode(null); setError(null); }}>
        Bjud in en medboende
      </Button>

      {open ? (
        <Sheet
          title="Bjud in en medboende"
          onClose={() => setOpen(false)}
          footer={
            code ? (
              <Button variant="primary" block onClick={() => setOpen(false)}>
                Klart
              </Button>
            ) : (
              <Button variant="primary" block loading={pending} onClick={() => void invite()}>
                Skapa inbjudan
              </Button>
            )
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}

            {code ? (
              <>
                <Banner tone="success" title="Inbjudan är skapad">
                  <p className="small">
                    Ge koden till den du vill bjuda in. Den används när personen skapar sitt konto,
                    och gäller i 30 dagar.
                  </p>
                </Banner>
                <p className="trace" style={{ fontSize: '1.4rem', textAlign: 'center', letterSpacing: '0.1em' }}>
                  {code}
                </p>
              </>
            ) : (
              <>
                <p className="small muted">
                  En medboende får se bostadens ärenden, bokningar och driftinformation, men inte
                  dina avier eller ditt kontrakt.
                </p>
                <Field label="E-postadress" optional hint="Används bara för att veta vem inbjudan gäller.">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
