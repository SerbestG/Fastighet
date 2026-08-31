import { useNavigate } from 'react-router-dom';
import { categoryLabel, formatDurationHours } from '@hemvist/shared';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { longDate, timeRange } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { AlertIcon, ChartIcon } from '../components/icons.js';

interface Dashboard {
  kpis: { key: string; label: string; value: number; tone?: string; drilldown: { view: string; filters: Record<string, unknown> } }[];
  serviceLevels: {
    avgResponseHours: number | null;
    avgResolutionHours: number | null;
    measuredCases: number;
    basis: string;
  };
  topCategories: { category_key: string; subcategory_key: string; count: number }[];
  casesPerProperty: { property_id: string; property_name: string; area_name: string; total: number; open: number; overdue: number }[];
  upcomingVisits: { id: string; starts_at: string; ends_at: string; resource_name: string; case_number: string | null; case_id: string | null; object_number: string | null }[];
  activeNotices: { id: string; kind: string; severity: string; title: string; starts_at: string | null; expected_end_at: string | null }[];
  satisfaction: { average: number | null; responses: number; last90d: number | null };
  unreadThreads: number;
  contractors: { name: string; total: number; completed: number; declined: number; blocked: number; avg_hours: number | null }[];
}

/**
 * Översikten bygger enbart på verkliga rader. Saknas underlag skrivs det ut i
 * klartext i stället för att visa en nolla som ser ut som ett mätvärde.
 */
export function DashboardPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const state = useQuery<Dashboard>('/api/staff/dashboard');

  const openDrilldown = (filters: Record<string, unknown>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
      else params.set(key, String(value));
    }
    navigate(`/arenden?${params.toString()}`);
  };

  return (
    <div className="page-wide stack stack-6">
      <header className="page-header">
        <div className="eyebrow">Förvaltning</div>
        <h1>{t('staff.dashboard')}</h1>
      </header>

      <QueryBoundary state={state} loadingRows={4}>
        {(data) => (
          <>
            <section className="kpi-grid" aria-label="Nyckeltal">
              {data.kpis.map((kpi) => (
                <button
                  key={kpi.key}
                  type="button"
                  className="kpi"
                  data-tone={kpi.tone}
                  onClick={() => openDrilldown(kpi.drilldown.filters)}
                >
                  <span className="kpi-label">{kpi.label}</span>
                  <span className="kpi-value">{kpi.value}</span>
                  <span className="kpi-hint">Visa ärendena →</span>
                </button>
              ))}
            </section>

            <div className="grid grid-2">
              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  Servicenivå
                </h2>
                {data.serviceLevels.measuredCases === 0 ? (
                  <p className="muted small">Inga ärenden att mäta på under perioden.</p>
                ) : (
                  <>
                    <div className="row-between">
                      <span className="muted">{t('staff.avgResponse')}</span>
                      <span className="strong num">
                        {data.serviceLevels.avgResponseHours === null
                          ? 'Saknas'
                          : formatDurationHours(data.serviceLevels.avgResponseHours)}
                      </span>
                    </div>
                    <div className="row-between">
                      <span className="muted">{t('staff.avgResolution')}</span>
                      <span className="strong num">
                        {data.serviceLevels.avgResolutionHours === null
                          ? 'Saknas'
                          : formatDurationHours(data.serviceLevels.avgResolutionHours)}
                      </span>
                    </div>
                    <p className="xs subtle">
                      {data.serviceLevels.basis} {data.serviceLevels.measuredCases} ärenden.
                    </p>
                  </>
                )}
              </section>

              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('staff.satisfaction')}
                </h2>
                {data.satisfaction.responses === 0 ? (
                  <p className="muted small">Ingen återkoppling har lämnats ännu.</p>
                ) : (
                  <>
                    <div className="row-between">
                      <span className="kpi-value">{data.satisfaction.average?.toFixed(1)}</span>
                      <span className="muted small">av 5</span>
                    </div>
                    <p className="xs subtle">Bygger på {data.satisfaction.responses} svar.</p>
                  </>
                )}
              </section>
            </div>

            <div className="grid grid-2">
              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('staff.topCategories')}
                </h2>
                {data.topCategories.length === 0 ? (
                  <p className="muted small">Inga ärenden under perioden.</p>
                ) : (
                  data.topCategories.map((category) => {
                    const max = data.topCategories[0]!.count;
                    return (
                      <button
                        key={`${category.category_key}-${category.subcategory_key}`}
                        type="button"
                        className="bar-row"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%' }}
                        onClick={() => openDrilldown({ categoryKey: category.category_key })}
                      >
                        <span className="small" style={{ flex: '0 0 9rem', textAlign: 'left' }}>
                          {categoryLabel(category.category_key)}
                        </span>
                        <span className="bar-track">
                          <span className="bar-fill" style={{ width: `${(category.count / max) * 100}%` }} />
                        </span>
                        <span className="num small strong">{category.count}</span>
                      </button>
                    );
                  })
                )}
              </section>

              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('staff.casesPerProperty')}
                </h2>
                {data.casesPerProperty.length === 0 ? (
                  <p className="muted small">Inga ärenden under perioden.</p>
                ) : (
                  data.casesPerProperty.slice(0, 8).map((property) => (
                    <button
                      key={property.property_id}
                      type="button"
                      className="row-between"
                      style={{ background: 'none', border: 0, padding: 'var(--space-1) 0', cursor: 'pointer', width: '100%' }}
                      onClick={() => openDrilldown({ propertyId: property.property_id })}
                    >
                      <span className="small" style={{ textAlign: 'left' }}>
                        {property.property_name}
                        <span className="subtle"> · {property.area_name}</span>
                      </span>
                      <span className="row" style={{ gap: 'var(--space-2)' }}>
                        {property.overdue > 0 ? <Pill tone="warning">{property.overdue} sena</Pill> : null}
                        <span className="num strong">{property.open}</span>
                      </span>
                    </button>
                  ))
                )}
              </section>
            </div>

            <div className="grid grid-2">
              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('staff.upcomingVisits')}
                </h2>
                {data.upcomingVisits.length === 0 ? (
                  <p className="muted small">Inga bokade besök den närmaste veckan.</p>
                ) : (
                  data.upcomingVisits.map((visit) => (
                    <button
                      key={visit.id}
                      type="button"
                      className="row-between"
                      style={{ background: 'none', border: 0, padding: 'var(--space-1) 0', cursor: 'pointer', width: '100%' }}
                      onClick={() => visit.case_id && navigate(`/arenden/${visit.case_id}`)}
                    >
                      <span className="small" style={{ textAlign: 'left' }}>
                        {longDate(visit.starts_at)} {timeRange(visit.starts_at, visit.ends_at)}
                        <span className="subtle"> · {visit.object_number ?? visit.resource_name}</span>
                      </span>
                      {visit.case_number ? <span className="tag">{visit.case_number}</span> : null}
                    </button>
                  ))
                )}
              </section>

              <section className="card stack stack-3">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {t('staff.activeNotices')}
                </h2>
                {data.activeNotices.length === 0 ? (
                  <p className="muted small">Inga pågående driftstörningar.</p>
                ) : (
                  data.activeNotices.map((notice) => (
                    <div className="row" key={notice.id}>
                      <AlertIcon size={16} />
                      <span className="grow small">{notice.title}</span>
                      {notice.severity === 'critical' ? <Pill tone="critical">Kritisk</Pill> : null}
                    </div>
                  ))
                )}
              </section>
            </div>

            <section className="stack stack-3">
              <h2 className="section-title">{t('staff.contractorFollowUp')}</h2>
              {data.contractors.length === 0 ? (
                <EmptyState icon={<ChartIcon size={24} />} title="Inga entreprenörer registrerade" />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Entreprenör</th>
                        <th className="num">Uppdrag</th>
                        <th className="num">Klara</th>
                        <th className="num">Avböjda</th>
                        <th className="num">Hindrade</th>
                        <th className="num">Snitt tid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.contractors.map((contractor) => (
                        <tr key={contractor.name}>
                          <td>{contractor.name}</td>
                          <td className="num">{contractor.total}</td>
                          <td className="num">{contractor.completed}</td>
                          <td className="num">{contractor.declined}</td>
                          <td className="num">{contractor.blocked}</td>
                          <td className="num">
                            {contractor.avg_hours === null ? '–' : formatDurationHours(Number(contractor.avg_hours))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
