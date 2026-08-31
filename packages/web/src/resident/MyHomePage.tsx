import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { openProtectedFile } from '../lib/api.js';
import { formatAmount, formatDate } from '../lib/format.js';
import { DefinitionList, EmptyState, QueryBoundary } from '../components/ui.js';
import { DownloadIcon, HomeIcon, PhoneIcon, MailIcon } from '../components/icons.js';

interface MyHome {
  tenancies: {
    id: string;
    starts_at: string;
    ends_at: string | null;
    earliest_move_out: string | null;
    status: string;
    monthly_rent_ore: number | null;
    unit_id: string;
    object_number: string;
    unit_label: string;
    entrance_name: string;
    building_name: string;
    property_name: string;
    property_street: string;
    property_city: string;
    area_name: string;
    floor: number | null;
    rooms: number | null;
    area_sqm: number | null;
    floor_plan_file_id: string | null;
    has_elevator: boolean;
    construction_year: number | null;
  }[];
  features: { unit_id: string; category: string; label: string; value: string | null }[];
  coResidents: { tenancy_id: string; role: string; first_name: string; last_name: string; is_you: boolean; moved_in_at: string | null }[];
  contacts: { role_label: string; name: string; phone: string | null; email: string | null; hours: string | null }[];
  articles: { slug: string; category: string; title: string; body_html: string }[];
}

/** Sidan visar bara kvalitetssäkrade uppgifter från datalagret, inget påhittat. */
export function MyHomePage() {
  const { t } = useI18n();
  const state = useQuery<MyHome>('/api/my-home');

  return (
    <div className="page stack stack-6">
      <header className="page-header">
        <h1>{t('myHome.title')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.tenancies.length === 0,
          render: <EmptyState icon={<HomeIcon size={24} />} title="Inget boende kopplat" body="Kontakta din hyresvärd om något ser fel ut." />,
        }}
      >
        {(data) =>
          data.tenancies.map((tenancy) => {
            const features = data.features.filter((feature) => feature.unit_id === tenancy.unit_id);
            const residents = data.coResidents.filter((resident) => resident.tenancy_id === tenancy.id);
            const byCategory = new Map<string, typeof features>();
            for (const feature of features) {
              byCategory.set(feature.category, [...(byCategory.get(feature.category) ?? []), feature]);
            }

            return (
              <div className="stack stack-5" key={tenancy.id}>
                <section className="card stack stack-4">
                  <div>
                    <h2>{tenancy.property_street}</h2>
                    <p className="muted">
                      {tenancy.property_city} · {tenancy.area_name}
                    </p>
                  </div>
                  <DefinitionList
                    items={[
                      { label: t('myHome.objectNumber'), value: tenancy.object_number },
                      { label: 'Lägenhet', value: tenancy.unit_label },
                      { label: t('myHome.rooms'), value: tenancy.rooms ? `${tenancy.rooms} rum` : '–' },
                      { label: t('myHome.area'), value: tenancy.area_sqm ? `${tenancy.area_sqm} m²` : '–' },
                      { label: t('myHome.floor'), value: tenancy.floor !== null ? `Plan ${tenancy.floor}` : '–' },
                      { label: 'Trapphus', value: tenancy.entrance_name },
                      { label: t('myHome.moveIn'), value: formatDate(tenancy.starts_at) },
                      {
                        label: t('myHome.earliestMoveOut'),
                        value: tenancy.earliest_move_out ? formatDate(tenancy.earliest_move_out) : '–',
                      },
                      ...(tenancy.monthly_rent_ore
                        ? [{ label: 'Hyra per månad', value: formatAmount(tenancy.monthly_rent_ore) }]
                        : []),
                      { label: 'Hiss', value: tenancy.has_elevator ? 'Ja' : 'Nej' },
                    ]}
                  />
                  {tenancy.floor_plan_file_id ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void openProtectedFile(tenancy.floor_plan_file_id!, 'planlosning.pdf')}
                    >
                      <DownloadIcon size={16} /> {t('myHome.floorPlan')}
                    </button>
                  ) : null}
                </section>

                {residents.length ? (
                  <section className="stack stack-3">
                    <h2 className="section-title">{t('myHome.coResidents')}</h2>
                    <div className="card card-flush">
                      {residents.map((resident) => (
                        <div className="list-item" key={`${resident.first_name}-${resident.last_name}`} style={{ cursor: 'default' }}>
                          <span className="grow">
                            <span className="list-title">
                              {resident.first_name} {resident.last_name}
                              {resident.is_you ? ' (du)' : ''}
                            </span>
                            <span className="list-meta">
                              {resident.role === 'tenant' ? 'Hyresgäst' : 'Medboende'}
                              {resident.moved_in_at ? ` sedan ${formatDate(resident.moved_in_at)}` : ''}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {byCategory.size ? (
                  <section className="stack stack-3">
                    <h2 className="section-title">{t('myHome.equipment')}</h2>
                    <div className="card">
                      <DefinitionList
                        items={features.map((feature) => ({ label: feature.label, value: feature.value ?? '–' }))}
                      />
                    </div>
                  </section>
                ) : null}

                {data.contacts.length ? (
                  <section className="stack stack-3">
                    <h2 className="section-title">{t('myHome.contacts')}</h2>
                    <div className="card card-flush">
                      {data.contacts.map((contact) => (
                        <div className="list-item" key={contact.role_label} style={{ cursor: 'default' }}>
                          <span className="grow stack stack-1">
                            <span className="list-title">{contact.role_label}</span>
                            <span className="list-meta">{contact.name}</span>
                            {contact.hours ? <span className="xs subtle">{contact.hours}</span> : null}
                          </span>
                          <span className="row" style={{ gap: 'var(--space-1)' }}>
                            {contact.phone ? (
                              <a className="icon-btn" href={`tel:${contact.phone}`} aria-label={`Ring ${contact.role_label}`}>
                                <PhoneIcon size={18} />
                              </a>
                            ) : null}
                            {contact.email ? (
                              <a className="icon-btn" href={`mailto:${contact.email}`} aria-label={`Mejla ${contact.role_label}`}>
                                <MailIcon size={18} />
                              </a>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {data.articles.length ? (
                  <section className="stack stack-3">
                    <h2 className="section-title">Bra att veta</h2>
                    {data.articles.map((article) => (
                      <details className="card" key={article.slug}>
                        <summary className="strong" style={{ cursor: 'pointer' }}>
                          {article.title}
                        </summary>
                        <div
                          className="stack stack-2"
                          style={{ marginTop: 'var(--space-3)' }}
                          // Innehållet skapas av förvaltningen i administrationsgränssnittet.
                          dangerouslySetInnerHTML={{ __html: article.body_html }}
                        />
                      </details>
                    ))}
                  </section>
                ) : null}
              </div>
            );
          })
        }
      </QueryBoundary>
    </div>
  );
}
