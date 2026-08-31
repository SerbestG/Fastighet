import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CASE_STATUSES, type CaseStatus } from '@hemvist/shared';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatDate, formatTime, longDate, relativeTime } from '../lib/format.js';
import { Button, EmptyState, Input, Pill, QueryBoundary, Tabs } from '../components/ui.js';
import { AlertIcon, FilterIcon, SearchIcon, WrenchIcon } from '../components/icons.js';

interface CaseRow {
  id: string;
  case_number: string;
  kind: string;
  status: CaseStatus;
  priority: string;
  title: string;
  category_key: string;
  space: string | null;
  created_at: string;
  sla_resolve_at: string | null;
  overdue: boolean;
  sensitive: boolean;
  escalated: boolean;
  allow_master_key: boolean;
  has_pets: boolean;
  object_number: string | null;
  unit_label: string | null;
  building_name: string | null;
  property_name: string | null;
  property_street: string | null;
  area_name: string | null;
  latitude: number | null;
  longitude: number | null;
  assignee_first_name: string | null;
  assignee_last_name: string | null;
  team_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Mottaget',
  under_review: 'Under granskning',
  assigned: 'Tilldelat',
  visit_booked: 'Besök bokat',
  in_progress: 'Arbete pågår',
  awaiting_materials: 'Väntar på material',
  awaiting_tenant: 'Väntar på hyresgäst',
  resolved: 'Klart',
  closed: 'Avslutat',
  cancelled: 'Avbrutet',
};

const PRIORITY_LABEL: Record<string, string> = {
  emergency: 'Akut',
  high: 'Hög',
  normal: 'Normal',
  low: 'Låg',
};

const BOARD_COLUMNS: CaseStatus[] = [
  'received',
  'assigned',
  'visit_booked',
  'in_progress',
  'awaiting_tenant',
  'resolved',
];

type View = 'list' | 'board' | 'calendar' | 'map' | 'stats';

/**
 * Ärendeinkorgen kan visas på fem sätt. Samma urval ligger i grunden – vyn
 * ändrar bara hur ärendena presenteras, inte vilka som visas.
 */
export function CaseInboxPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState(params.get('q') ?? '');

  const query = useMemo(() => {
    const next = new URLSearchParams(params);
    next.set('limit', '100');
    return `/api/staff/cases?${next.toString()}`;
  }, [params]);

  const state = useQuery<{ cases: CaseRow[]; total: number }>(query);

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const activePriority = params.get('priority');
  const activeOverdue = params.get('overdue') === 'true';
  const activeUnassigned = params.get('unassigned') === 'true';

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header row-between">
        <div>
          <div className="eyebrow">Förvaltning</div>
          <h1>{t('staff.inbox')}</h1>
        </div>
        <span className="muted small num">{state.data?.total ?? 0} ärenden</span>
      </header>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <div className="grow row" style={{ gap: 'var(--space-2)' }}>
          <SearchIcon size={18} />
          <Input
            aria-label={t('common.search')}
            placeholder="Sök ärendenummer, adress eller text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setFilter('q', search || null);
            }}
          />
          <Button variant="secondary" onClick={() => setFilter('q', search || null)}>
            {t('common.search')}
          </Button>
        </div>
      </div>

      <div className="filter-bar">
        <FilterIcon size={16} />
        <button type="button" className="chip" aria-pressed={!activePriority && !activeOverdue && !activeUnassigned} onClick={() => setParams({}, { replace: true })}>
          {t('common.all')}
        </button>
        <button type="button" className="chip" aria-pressed={activePriority === 'emergency'} onClick={() => setFilter('priority', activePriority === 'emergency' ? null : 'emergency')}>
          Akuta
        </button>
        <button type="button" className="chip" aria-pressed={activeOverdue} onClick={() => setFilter('overdue', activeOverdue ? null : 'true')}>
          Försenade
        </button>
        <button type="button" className="chip" aria-pressed={activeUnassigned} onClick={() => setFilter('unassigned', activeUnassigned ? null : 'true')}>
          Ej tilldelade
        </button>
        <select
          className="select"
          style={{ width: 'auto', minWidth: '11rem' }}
          aria-label="Status"
          value={params.get('status') ?? ''}
          onChange={(event) => setFilter('status', event.target.value || null)}
        >
          <option value="">Alla statusar</option>
          {CASE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>

      <Tabs
        label="Visningsläge"
        active={view}
        onChange={setView}
        tabs={[
          { value: 'list', label: t('staff.viewList') },
          { value: 'board', label: t('staff.viewBoard') },
          { value: 'calendar', label: t('staff.viewCalendar') },
          { value: 'map', label: t('staff.viewMap') },
          { value: 'stats', label: t('staff.viewStats') },
        ]}
      />

      <QueryBoundary
        state={state}
        loadingRows={5}
        empty={{
          when: (data) => data.cases.length === 0,
          render: <EmptyState icon={<WrenchIcon size={24} />} title="Inga ärenden matchar urvalet" body="Ändra filtren för att se fler." />,
        }}
      >
        {(data) => {
          if (view === 'board') {
            return (
              <div className="board">
                {BOARD_COLUMNS.map((status) => {
                  const items = data.cases.filter((item) => item.status === status);
                  return (
                    <div className="board-column" key={status}>
                      <h3>
                        {STATUS_LABEL[status]}
                        <span className="tag">{items.length}</span>
                      </h3>
                      {items.map((item) => (
                        <button key={item.id} type="button" className="board-card" onClick={() => navigate(`/arenden/${item.id}`)}>
                          <div className="title clamp-2">{item.title}</div>
                          <div className="xs subtle">
                            {item.case_number} · {item.object_number ?? item.property_name}
                          </div>
                          <div className="row" style={{ gap: 4, marginTop: 6 }}>
                            {item.priority === 'emergency' ? <Pill tone="critical">Akut</Pill> : null}
                            {item.overdue ? <Pill tone="warning">Sen</Pill> : null}
                          </div>
                        </button>
                      ))}
                      {items.length === 0 ? <p className="xs subtle">Inga ärenden</p> : null}
                    </div>
                  );
                })}
              </div>
            );
          }

          if (view === 'calendar') {
            const withDue = data.cases.filter((item) => item.sla_resolve_at);
            const grouped = new Map<string, CaseRow[]>();
            for (const item of withDue) {
              const day = formatDate(item.sla_resolve_at!);
              grouped.set(day, [...(grouped.get(day) ?? []), item]);
            }
            const days = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
            return days.length === 0 ? (
              <EmptyState title="Inga ärenden med sluttid" body="Ärenden får en sluttid utifrån prioritet." />
            ) : (
              <div className="stack stack-4">
                {days.map(([day, items]) => (
                  <section key={day} className="card stack stack-2">
                    <h3 className="section-title" style={{ margin: 0 }}>
                      {longDate(day)}
                    </h3>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="row-between"
                        style={{ background: 'none', border: 0, padding: 'var(--space-2) 0', cursor: 'pointer', width: '100%' }}
                        onClick={() => navigate(`/arenden/${item.id}`)}
                      >
                        <span className="small" style={{ textAlign: 'left' }}>
                          {formatTime(item.sla_resolve_at!)} · {item.title}
                        </span>
                        <Pill tone={item.overdue ? 'critical' : 'info'}>{item.overdue ? 'Försenat' : STATUS_LABEL[item.status]}</Pill>
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            );
          }

          if (view === 'map') {
            const located = data.cases.filter((item) => item.latitude !== null && item.longitude !== null);
            if (located.length === 0) {
              return <EmptyState title="Inga ärenden med koordinater" body="Fastigheterna behöver koordinater för kartvyn." />;
            }
            const lats = located.map((item) => item.latitude!);
            const lngs = located.map((item) => item.longitude!);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);
            const spanLat = maxLat - minLat || 0.01;
            const spanLng = maxLng - minLng || 0.01;

            // Grupperar ärenden per fastighet så att kartan visar var trycket finns.
            const byProperty = new Map<string, { count: number; overdue: number; item: CaseRow }>();
            for (const item of located) {
              const key = item.property_name ?? item.id;
              const current = byProperty.get(key) ?? { count: 0, overdue: 0, item };
              byProperty.set(key, { count: current.count + 1, overdue: current.overdue + (item.overdue ? 1 : 0), item });
            }

            return (
              <>
                <div className="map">
                  {[...byProperty.entries()].map(([name, group]) => (
                    <button
                      key={name}
                      type="button"
                      className="map-pin"
                      data-tone={group.overdue > 0 ? 'warning' : undefined}
                      style={{
                        left: `${8 + ((group.item.longitude! - minLng) / spanLng) * 84}%`,
                        top: `${88 - ((group.item.latitude! - minLat) / spanLat) * 76}%`,
                      }}
                      onClick={() => setFilter('q', name)}
                    >
                      {name} ({group.count})
                    </button>
                  ))}
                </div>
                <p className="xs subtle">
                  Kartan placerar fastigheterna utifrån deras koordinater. Ett externt kartunderlag
                  läggs till när kartintegrationen konfigureras.
                </p>
              </>
            );
          }

          if (view === 'stats') {
            const byStatus = new Map<string, number>();
            const byPriority = new Map<string, number>();
            for (const item of data.cases) {
              byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
              byPriority.set(item.priority, (byPriority.get(item.priority) ?? 0) + 1);
            }
            const max = Math.max(...byStatus.values(), 1);
            return (
              <div className="grid grid-2">
                <section className="card stack stack-3">
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Per status
                  </h3>
                  {[...byStatus.entries()].map(([status, count]) => (
                    <div className="bar-row" key={status}>
                      <span className="small" style={{ flex: '0 0 9rem' }}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
                      </span>
                      <span className="num small strong">{count}</span>
                    </div>
                  ))}
                </section>
                <section className="card stack stack-3">
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Per prioritet
                  </h3>
                  {['emergency', 'high', 'normal', 'low'].map((priority) => (
                    <div className="bar-row" key={priority}>
                      <span className="small" style={{ flex: '0 0 9rem' }}>
                        {PRIORITY_LABEL[priority]}
                      </span>
                      <span className="bar-track">
                        <span
                          className="bar-fill"
                          data-tone="accent"
                          style={{ width: `${((byPriority.get(priority) ?? 0) / Math.max(data.cases.length, 1)) * 100}%` }}
                        />
                      </span>
                      <span className="num small strong">{byPriority.get(priority) ?? 0}</span>
                    </div>
                  ))}
                </section>
              </div>
            );
          }

          return (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Ärende</th>
                    <th className="hide-mobile">Adress</th>
                    <th>Status</th>
                    <th className="hide-mobile">Prioritet</th>
                    <th className="hide-mobile">Handläggare</th>
                    <th className="hide-mobile">Skapat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((item) => (
                    <tr key={item.id} data-clickable="true" onClick={() => navigate(`/arenden/${item.id}`)}>
                      <td>
                        <div className="strong">{item.title}</div>
                        <div className="xs subtle">
                          {item.case_number}
                          {item.sensitive ? ' · Känsligt' : ''}
                          {item.allow_master_key ? ' · Huvudnyckel' : ''}
                          {item.has_pets ? ' · Husdjur' : ''}
                        </div>
                      </td>
                      <td className="hide-mobile small">
                        {item.property_street ?? item.property_name}
                        {item.unit_label ? `, lgh ${item.unit_label}` : ''}
                        <div className="xs subtle">{item.area_name}</div>
                      </td>
                      <td>
                        <Pill tone={item.overdue ? 'critical' : item.status === 'resolved' ? 'success' : 'info'}>
                          {STATUS_LABEL[item.status]}
                        </Pill>
                        {item.overdue ? (
                          <div className="xs" style={{ color: 'var(--status-critical)' }}>
                            <AlertIcon size={12} /> Försenat
                          </div>
                        ) : null}
                      </td>
                      <td className="hide-mobile">
                        {item.priority === 'emergency' ? (
                          <Pill tone="critical">Akut</Pill>
                        ) : (
                          <span className="small">{PRIORITY_LABEL[item.priority]}</span>
                        )}
                      </td>
                      <td className="hide-mobile small">
                        {item.assignee_first_name
                          ? `${item.assignee_first_name} ${item.assignee_last_name ?? ''}`
                          : (item.team_name ?? <span className="subtle">Ej tilldelat</span>)}
                      </td>
                      <td className="hide-mobile small subtle">{relativeTime(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
