import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { longDate, timeRange } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary, Tabs } from '../components/ui.js';
import { AlertIcon, ChevronRight, MegaphoneIcon } from '../components/icons.js';

interface Notice {
  id: string;
  kind: string;
  severity: 'critical' | 'important' | 'info';
  localized_title: string;
  summary: string | null;
  starts_at: string | null;
  expected_end_at: string | null;
  status: string;
  pinned: boolean;
  read_at: string | null;
  acknowledged_at: string | null;
  requires_acknowledgement: boolean;
}

export function NoticesPage() {
  const { t } = useI18n();
  const state = useQuery<{ operational: Notice[]; news: Notice[] }>('/api/notices');
  const [tab, setTab] = useState<'operational' | 'news'>('operational');

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('notice.title')}</h1>
      </header>

      <QueryBoundary state={state}>
        {(data) => {
          const list = tab === 'operational' ? data.operational : data.news;
          return (
            <>
              <Tabs
                label="Typ av information"
                active={tab}
                onChange={setTab}
                tabs={[
                  { value: 'operational', label: t('notice.title'), count: data.operational.length },
                  { value: 'news', label: t('notice.news'), count: data.news.length },
                ]}
              />
              {list.length === 0 ? (
                <EmptyState
                  icon={tab === 'operational' ? <AlertIcon size={24} /> : <MegaphoneIcon size={24} />}
                  title={t('notice.noneTitle')}
                  body={t('notice.noneBody')}
                />
              ) : (
                <div className="card card-flush">
                  {list.map((notice) => (
                    <Link className="list-item" to={`/driftinfo/${notice.id}`} key={notice.id}>
                      <span className="grow stack stack-1">
                        <span className="list-title">
                          {notice.pinned ? '📌 ' : ''}
                          {notice.localized_title}
                        </span>
                        {notice.summary ? <span className="list-meta clamp-2">{notice.summary}</span> : null}
                        {notice.starts_at ? (
                          <span className="xs subtle">
                            {longDate(notice.starts_at)}
                            {notice.expected_end_at ? ` ${timeRange(notice.starts_at, notice.expected_end_at)}` : ''}
                          </span>
                        ) : null}
                        <span className="row" style={{ gap: 'var(--space-2)', marginTop: 4 }}>
                          {notice.severity === 'critical' ? <Pill tone="critical">Viktigt</Pill> : null}
                          {notice.status === 'resolved' ? <Pill tone="success">{t('notice.resolved')}</Pill> : null}
                          {notice.requires_acknowledgement && !notice.acknowledged_at ? (
                            <Pill tone="warning">Kräver bekräftelse</Pill>
                          ) : null}
                          {!notice.read_at ? <span className="tag">Nytt</span> : null}
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
