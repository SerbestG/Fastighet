import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { relativeTime } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary, Tabs } from '../components/ui.js';
import { ChevronRight, PlusIcon, WrenchIcon } from '../components/icons.js';

interface CaseSummary {
  id: string;
  case_number: string;
  title: string;
  status: string;
  simpleStatus: 'not_started' | 'in_progress' | 'completed';
  priority: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  has_feedback: boolean;
  upcoming_visits: number;
  property_name: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  received: 'Mottaget',
  under_review: 'Under granskning',
  assigned: 'Tilldelat',
  visit_booked: 'Besök bokat',
  in_progress: 'Arbete pågår',
  awaiting_materials: 'Väntar på material',
  awaiting_tenant: 'Väntar på dig',
  resolved: 'Klart',
  closed: 'Avslutat',
  cancelled: 'Avbrutet',
};

function toneFor(status: string): 'critical' | 'warning' | 'success' | 'info' | 'neutral' {
  if (status === 'awaiting_tenant') return 'warning';
  if (status === 'resolved') return 'success';
  if (status === 'closed' || status === 'cancelled') return 'neutral';
  return 'info';
}

export function CasesPage() {
  const { t } = useI18n();
  const { term } = useAuth();
  const state = useQuery<{ cases: CaseSummary[] }>('/api/cases');
  const [tab, setTab] = useState<'open' | 'closed'>('open');

  return (
    <div className="page stack stack-5">
      <header className="page-header row-between">
        <h1>{t('case.myCases')}</h1>
        <Link className="btn btn-primary btn-sm" to="/arenden/nytt">
          <PlusIcon size={16} /> {t('common.create')}
        </Link>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.cases.length === 0,
          render: (
            <EmptyState
              icon={<WrenchIcon size={24} />}
              title={t('case.noneTitle')}
              body={t('case.noneBody')}
              action={
                <Link className="btn btn-primary" to="/arenden/nytt">
                  {term('case', t('case.new'))}
                </Link>
              }
            />
          ),
        }}
      >
        {(data) => {
          const open = data.cases.filter((item) => item.simpleStatus !== 'completed');
          const closed = data.cases.filter((item) => item.simpleStatus === 'completed');
          const shown = tab === 'open' ? open : closed;

          return (
            <>
              <Tabs
                label="Filtrera ärenden"
                active={tab}
                onChange={setTab}
                tabs={[
                  { value: 'open', label: 'Pågående', count: open.length },
                  { value: 'closed', label: 'Avslutade', count: closed.length },
                ]}
              />
              {shown.length === 0 ? (
                <EmptyState
                  title={tab === 'open' ? 'Inga pågående ärenden' : 'Inga avslutade ärenden'}
                  body={tab === 'open' ? 'Allt är lugnt just nu.' : 'Avslutade ärenden sparas här.'}
                />
              ) : (
                <div className="card card-flush">
                  {shown.map((item) => (
                    <Link className="list-item" to={`/arenden/${item.id}`} key={item.id}>
                      <span className="grow stack stack-1">
                        <span className="list-title">{item.title}</span>
                        <span className="list-meta">
                          {item.case_number} · {relativeTime(item.last_activity_at ?? item.updated_at)}
                        </span>
                        <span className="row" style={{ gap: 'var(--space-2)', marginTop: 4 }}>
                          <Pill tone={toneFor(item.status)}>{STATUS_LABEL[item.status] ?? item.status}</Pill>
                          {item.priority === 'emergency' ? <Pill tone="critical">Akut</Pill> : null}
                          {item.upcoming_visits > 0 ? <Pill tone="info">Besök bokat</Pill> : null}
                          {item.status === 'resolved' && !item.has_feedback ? (
                            <span className="tag">Lämna gärna återkoppling</span>
                          ) : null}
                        </span>
                      </span>
                      <ChevronRight size={18} className="chevron" />
                    </Link>
                  ))}
                </div>
              )}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
