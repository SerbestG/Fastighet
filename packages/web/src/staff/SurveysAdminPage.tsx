import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatDate } from '../lib/format.js';
import { Banner, EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { ClipboardIcon } from '../components/icons.js';

interface Survey {
  id: string;
  kind: string;
  title: string;
  status: string;
  anonymous: boolean;
  opens_at: string | null;
  closes_at: string | null;
  response_count: number;
}

interface Results {
  survey: { id: string; title: string; questions: { key: string; label: string; type: string }[] };
  totalResponses: number;
  minimumGroupSize: number;
  groups: { id: string | null; name: string | null; responses: number; suppressed: boolean; summary: Record<string, unknown> | null }[];
}

/**
 * Enkätresultat sammanställs per fastighet och område. Grupper med få svar
 * redovisas inte i detalj, så att enskilda svar inte kan härledas.
 */
export function SurveysAdminPage() {
  const { t } = useI18n();
  const state = useQuery<{ surveys: Survey[] }>('/api/staff/surveys');
  const [selected, setSelected] = useState<string | null>(null);
  const results = useQuery<Results>(selected ? `/api/staff/surveys/${selected}/results` : null);

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Uppföljning</div>
        <h1>{t('staff.surveys')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.surveys.length === 0,
          render: <EmptyState icon={<ClipboardIcon size={24} />} title="Inga enkäter" />,
        }}
      >
        {(data) => (
          <div className="card card-flush">
            {data.surveys.map((survey) => (
              <button
                key={survey.id}
                type="button"
                className="list-item"
                onClick={() => setSelected(selected === survey.id ? null : survey.id)}
                style={{ background: selected === survey.id ? 'var(--surface-primary-soft)' : undefined }}
              >
                <span className="grow stack stack-1">
                  <span className="list-title">{survey.title}</span>
                  <span className="list-meta">
                    {survey.anonymous ? 'Anonym' : 'Med identitet'}
                    {survey.closes_at ? ` · stänger ${formatDate(survey.closes_at)}` : ''}
                  </span>
                </span>
                <Pill tone={survey.status === 'open' ? 'success' : 'neutral'}>{survey.status === 'open' ? 'Öppen' : 'Stängd'}</Pill>
                <span className="tag">{survey.response_count} svar</span>
              </button>
            ))}
          </div>
        )}
      </QueryBoundary>

      {selected ? (
        <QueryBoundary state={results}>
          {(data) => (
            <section className="stack stack-4">
              <h2>{data.survey.title}</h2>
              <Banner tone="info" title={`${data.totalResponses} svar totalt`}>
                <p className="small">
                  Grupper med färre än {data.minimumGroupSize} svar redovisas inte i detalj, för att skydda
                  enskilda svar. Fritextsvar visas inte i sammanställningen.
                </p>
              </Banner>
              <div className="grid grid-2">
                {data.groups.map((group) => (
                  <div className="card stack stack-3" key={group.id ?? 'okänd'}>
                    <div className="row-between">
                      <h3>{group.name ?? 'Okänd fastighet'}</h3>
                      <span className="tag">{group.responses} svar</span>
                    </div>
                    {group.suppressed ? (
                      <p className="small muted">
                        För få svar för att redovisa. Resultatet räknas ändå in i totalen.
                      </p>
                    ) : (
                      <div className="stack stack-2">
                        {data.survey.questions.map((question) => {
                          const value = group.summary?.[question.key] as
                            | { average?: number; responses?: number; yes?: number; no?: number }
                            | Record<string, number>
                            | null;
                          if (!value) return null;
                          if (question.type === 'rating' && 'average' in value) {
                            return (
                              <div className="bar-row" key={question.key}>
                                <span className="small" style={{ flex: '0 0 10rem' }}>
                                  {question.label}
                                </span>
                                <span className="bar-track">
                                  <span className="bar-fill" style={{ width: `${((value.average ?? 0) / 5) * 100}%` }} />
                                </span>
                                <span className="num small strong">{value.average?.toFixed(1)}</span>
                              </div>
                            );
                          }
                          if (question.type === 'boolean' && 'yes' in value) {
                            return (
                              <div className="row-between small" key={question.key}>
                                <span>{question.label}</span>
                                <span className="num">
                                  {value.yes} ja / {value.no} nej
                                </span>
                              </div>
                            );
                          }
                          if (question.type === 'text' && 'responses' in value) {
                            return (
                              <div className="row-between small subtle" key={question.key}>
                                <span>{question.label}</span>
                                <span className="num">{value.responses} fritextsvar</span>
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </QueryBoundary>
      ) : null}
    </div>
  );
}
