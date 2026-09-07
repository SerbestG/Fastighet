import { useQuery } from '../lib/useQuery.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, Pill, QueryBoundary } from '../components/ui.js';

/**
 * Färskhet för uppgifter från verksamhetssystemet (krav C.3.10, C.3.13).
 *
 * Vyn säger rakt ut när en datamängd aldrig hämtats eller är för gammal. Det är
 * bättre än att visa gamla uppgifter som om de vore aktuella.
 */

type Freshness = 'fresh' | 'stale' | 'never' | 'not_connected';

interface Dataset {
  dataset: string;
  label: { sv: string; en: string };
  freshness: Freshness;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  staleAfterMinutes: number;
}

interface Response {
  connected: boolean;
  datasets: Dataset[];
  outbox: Record<string, number>;
}

const TONE: Record<Freshness, 'success' | 'warning' | 'neutral' | 'critical'> = {
  fresh: 'success',
  stale: 'warning',
  never: 'neutral',
  not_connected: 'neutral',
};

const LABEL: Record<Freshness, string> = {
  fresh: 'Aktuell',
  stale: 'Inaktuell',
  never: 'Aldrig hämtad',
  not_connected: 'Ingen anslutning',
};

export function SyncStatus() {
  const state = useQuery<Response>('/api/staff/integrations/sync');

  return (
    <section className="stack stack-4">
      <div>
        <h2 className="section-title">Uppgifter från verksamhetssystemet</h2>
        <p className="small muted">
          Varje datamängd hämtas för sig och bär sin egen tidsstämpel. Går en hämtning fel skjuts
          nästa försök upp, och uppgifterna märks som inaktuella i stället för att visas som färska.
        </p>
      </div>

      <QueryBoundary state={state} loadingRows={4}>
        {(data) => (
          <>
            {!data.connected ? (
              <Banner tone="info" title="Fastighetssystemet är inte anslutet">
                <p className="small">
                  Ingen synkronisering sker. Uppgifterna i appen är de som lagts in manuellt eller
                  importerats som fil.
                </p>
              </Banner>
            ) : null}

            <div className="card card-flush">
              {data.datasets.map((row) => (
                <div className="integration-row" key={row.dataset}>
                  <div className="grow">
                    <div className="strong">{row.label.sv}</div>
                    <div className="small muted">
                      {row.lastSuccessAt
                        ? `Senast hämtad ${formatDateTime(row.lastSuccessAt)}`
                        : 'Har aldrig hämtats'}
                      {row.consecutiveFailures > 0
                        ? ` · ${row.consecutiveFailures} misslyckade försök i rad`
                        : ''}
                    </div>
                    {row.lastError ? (
                      <div className="xs" style={{ color: 'var(--status-critical)' }}>
                        {row.lastError}
                      </div>
                    ) : null}
                  </div>
                  <Pill tone={TONE[row.freshness]}>{LABEL[row.freshness]}</Pill>
                </div>
              ))}
            </div>

            {(data.outbox.pending ?? 0) > 0 || (data.outbox.blocked_no_integration ?? 0) > 0 ? (
              <Banner tone="warning" title="Ändringar väntar på att lämnas över">
                <p className="small">
                  {data.outbox.pending ?? 0} ändringar i kö
                  {(data.outbox.blocked_no_integration ?? 0) > 0
                    ? `, varav ${data.outbox.blocked_no_integration} väntar på att integrationen ansluts`
                    : ''}
                  . Ingenting går förlorat: raderna ligger kvar tills verksamhetssystemet kvitterat.
                </p>
              </Banner>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </section>
  );
}
