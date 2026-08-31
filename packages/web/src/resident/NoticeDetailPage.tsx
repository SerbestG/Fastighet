import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import { Banner, Button, DefinitionList, Pill, QueryBoundary } from '../components/ui.js';
import { CheckIcon, ChevronLeft } from '../components/icons.js';

interface NoticeDetail {
  notice: {
    id: string;
    kind: string;
    severity: 'critical' | 'important' | 'info';
    localized_title: string;
    localized_body_html: string;
    summary: string | null;
    starts_at: string | null;
    expected_end_at: string | null;
    next_update_at: string | null;
    contact_info: string | null;
    status: string;
    requires_acknowledgement: boolean;
    acknowledged_at: string | null;
    published_at: string | null;
  };
}

export function NoticeDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useQuery<NoticeDetail>(id ? `/api/notices/${id}` : null);
  const [pending, setPending] = useState(false);

  const acknowledge = async () => {
    if (!id) return;
    setPending(true);
    try {
      await api.post(`/api/notices/${id}/acknowledge`, {});
      toast.show(t('notice.acknowledged'));
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page stack stack-5">
      <div className="row">
        <button type="button" className="icon-btn" onClick={() => navigate('/driftinfo')} aria-label={t('common.back')}>
          <ChevronLeft />
        </button>
      </div>

      <QueryBoundary state={state}>
        {(data) => (
          <article className="stack stack-5">
            <header className="stack stack-3">
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                {data.notice.severity === 'critical' ? <Pill tone="critical">Viktigt</Pill> : null}
                {data.notice.status === 'resolved' ? <Pill tone="success">{t('notice.resolved')}</Pill> : (
                  data.notice.starts_at && new Date(data.notice.starts_at) <= new Date() ? (
                    <Pill tone="warning">{t('notice.ongoing')}</Pill>
                  ) : (
                    <Pill tone="info">{t('notice.planned')}</Pill>
                  )
                )}
              </div>
              <h1>{data.notice.localized_title}</h1>
              {data.notice.published_at ? (
                <p className="small subtle">Publicerad {formatDateTime(data.notice.published_at)}</p>
              ) : null}
            </header>

            <div className="card" dangerouslySetInnerHTML={{ __html: data.notice.localized_body_html }} />

            <DefinitionList
              items={[
                ...(data.notice.starts_at ? [{ label: t('notice.startsAt'), value: formatDateTime(data.notice.starts_at) }] : []),
                ...(data.notice.expected_end_at
                  ? [{ label: t('notice.expectedEnd'), value: formatDateTime(data.notice.expected_end_at) }]
                  : []),
                ...(data.notice.next_update_at
                  ? [{ label: t('notice.nextUpdate'), value: formatDateTime(data.notice.next_update_at) }]
                  : []),
              ]}
            />

            {data.notice.contact_info ? (
              <Banner tone="info" title={t('notice.contact')}>
                <p className="small">{data.notice.contact_info}</p>
              </Banner>
            ) : null}

            {data.notice.requires_acknowledgement ? (
              data.notice.acknowledged_at ? (
                <Banner tone="success" title={t('notice.acknowledged')} />
              ) : (
                <Button variant="primary" block loading={pending} icon={<CheckIcon size={18} />} onClick={() => void acknowledge()}>
                  {t('notice.acknowledge')}
                </Button>
              )
            ) : null}
          </article>
        )}
      </QueryBoundary>
    </div>
  );
}
