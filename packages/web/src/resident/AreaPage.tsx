import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { EmptyState, QueryBoundary } from '../components/ui.js';
import { LeafIcon, PinIcon } from '../components/icons.js';

interface AreaData {
  infos: { id: string; kind: string; title: string; body: string; latitude: number | null; longitude: number | null }[];
  properties: { id: string; name: string; street: string; city: string; latitude: number | null; longitude: number | null; area_name: string }[];
  resources: { id: string; kind: string; name: string; description: string | null }[];
}

export function AreaPage() {
  const { t } = useI18n();
  const state = useQuery<AreaData>('/api/area');

  return (
    <div className="page stack stack-6">
      <header className="page-header">
        <h1>{t('nav.area')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.infos.length === 0 && data.resources.length === 0,
          render: <EmptyState icon={<LeafIcon size={24} />} title="Ingen områdesinformation" body="Din hyresvärd har inte lagt in något här ännu." />,
        }}
      >
        {(data) => (
          <>
            {data.properties.length ? (
              <section className="card stack stack-2">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Din adress
                </h2>
                {data.properties.map((property) => (
                  <div className="row" key={property.id}>
                    <PinIcon size={18} />
                    <div>
                      <div className="strong">{property.street}</div>
                      <div className="small muted">
                        {property.city} · {property.area_name}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            <section className="stack stack-3">
              <h2 className="section-title">Om området</h2>
              <div className="stack stack-3">
                {data.infos.map((info) => (
                  <details className="card" key={info.id}>
                    <summary className="strong" style={{ cursor: 'pointer' }}>
                      {info.title}
                    </summary>
                    <p style={{ marginTop: 'var(--space-3)' }}>{info.body}</p>
                  </details>
                ))}
              </div>
            </section>

            {data.resources.length ? (
              <section className="stack stack-3">
                <h2 className="section-title">Gemensamma resurser</h2>
                <div className="card card-flush">
                  {data.resources.map((resource) => (
                    <div className="list-item" key={resource.id} style={{ cursor: 'default' }}>
                      <span className="grow">
                        <span className="list-title">{resource.name}</span>
                        {resource.description ? <span className="list-meta">{resource.description}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
