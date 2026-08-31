import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { KeyIcon } from '../components/icons.js';

interface AccessData {
  accessPoints: {
    id: string;
    kind: string;
    name: string;
    integration_status: string | null;
    integration_name: string | null;
    digitalKeyAvailable: boolean;
  }[];
  grants: { id: string; name: string; kind: string; valid_from: string; valid_to: string | null; status: string }[];
  digitalKeys: { available: boolean; reason: string };
}

const KIND_LABEL: Record<string, string> = {
  entrance_door: 'Port',
  apartment: 'Lägenhet',
  laundry: 'Tvättstuga',
  garage: 'Garage',
  bike_room: 'Cykelrum',
  storage: 'Förråd',
  common_room: 'Gemensam lokal',
  other: 'Övrigt',
};

/**
 * Nycklar och behörigheter.
 *
 * Ingen digital nyckel visas förrän passersystemet är anslutet. Sidan säger
 * rakt ut vad som gäller i stället för att visa en knapp som inte fungerar.
 */
export function AccessPage() {
  const { t } = useI18n();
  const state = useQuery<AccessData>('/api/access');

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>Nycklar och passage</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.accessPoints.length === 0,
          render: <EmptyState icon={<KeyIcon size={24} />} title="Inga passagepunkter" body="Din adress har inga registrerade passagepunkter." />,
        }}
      >
        {(data) => (
          <>
            {!data.digitalKeys.available ? (
              <Banner tone="info" title="Digitala nycklar är inte tillgängliga">
                <p className="small">{data.digitalKeys.reason}</p>
              </Banner>
            ) : null}

            <section className="stack stack-3">
              <h2 className="section-title">Passagepunkter för din adress</h2>
              <div className="card card-flush">
                {data.accessPoints.map((point) => (
                  <div className="list-item" key={point.id} style={{ cursor: 'default' }}>
                    <KeyIcon size={18} />
                    <span className="grow">
                      <span className="list-title">{point.name}</span>
                      <span className="list-meta">{KIND_LABEL[point.kind] ?? point.kind}</span>
                    </span>
                    {point.digitalKeyAvailable ? (
                      <Pill tone="success">Digital nyckel</Pill>
                    ) : (
                      <Pill tone="neutral">Fysisk nyckel</Pill>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {data.grants.length ? (
              <section className="stack stack-3">
                <h2 className="section-title">Aktiva behörigheter</h2>
                <div className="card card-flush">
                  {data.grants.map((grant) => (
                    <div className="list-item" key={grant.id} style={{ cursor: 'default' }}>
                      <span className="grow">
                        <span className="list-title">{grant.name}</span>
                        <span className="list-meta">
                          Från {formatDateTime(grant.valid_from)}
                          {grant.valid_to ? ` till ${formatDateTime(grant.valid_to)}` : ''}
                        </span>
                      </span>
                      <Pill tone="success">Aktiv</Pill>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <p className="small muted">
              {t('common.help')}: kontakta kundservice om en nyckel eller tagg inte fungerar.
            </p>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
