import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDate } from '../lib/format.js';
import { Banner, Button, EmptyState, Field, Pill, QueryBoundary, Sheet, Textarea } from '../components/ui.js';
import { ClipboardIcon, StarIcon } from '../components/icons.js';

interface Question {
  key: string;
  label: string;
  type: 'rating' | 'single_choice' | 'multi_choice' | 'text' | 'boolean';
  required: boolean;
  options?: { value: string; label: string }[];
}

interface Survey {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  closes_at: string | null;
  anonymous: boolean;
  questions: Question[];
  answered: boolean;
}

export function SurveysPage() {
  const { t } = useI18n();
  const toast = useToast();
  const state = useQuery<{ surveys: Survey[] }>('/api/surveys');
  const [active, setActive] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (!active) return;
    setPending(true);
    try {
      await api.post(`/api/surveys/${active.id}/responses`, { answers });
      toast.show(t('survey.thanks'));
      setActive(null);
      setAnswers({});
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  const missing = active?.questions.filter((question) => question.required && answers[question.key] === undefined) ?? [];

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('survey.title')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.surveys.length === 0,
          render: <EmptyState icon={<ClipboardIcon size={24} />} title={t('survey.noneTitle')} body={t('survey.noneBody')} />,
        }}
      >
        {(data) => (
          <div className="stack stack-3">
            {data.surveys.map((survey) => (
              <article className="card stack stack-3" key={survey.id}>
                <div className="row-between row-start">
                  <div className="grow">
                    <h2>{survey.title}</h2>
                    {survey.description ? <p className="small muted">{survey.description}</p> : null}
                  </div>
                  {survey.answered ? <Pill tone="success">Besvarad</Pill> : null}
                </div>
                <div className="row-between">
                  <span className="xs subtle">
                    {survey.anonymous ? 'Svaren är anonyma.' : 'Svaren kopplas till ditt konto.'}
                    {survey.closes_at ? ` Stänger ${formatDate(survey.closes_at)}.` : ''}
                  </span>
                  {!survey.answered ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setActive(survey);
                        setAnswers({});
                      }}
                    >
                      {t('survey.respond')}
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </QueryBoundary>

      {active ? (
        <Sheet
          title={active.title}
          onClose={() => setActive(null)}
          footer={
            <Button variant="primary" block loading={pending} disabled={missing.length > 0} onClick={() => void submit()}>
              {t('common.send')}
            </Button>
          }
        >
          <div className="stack stack-5">
            {active.anonymous ? <Banner tone="info" title="Ditt svar är anonymt" /> : null}
            {active.questions.map((question) => (
              <div key={question.key}>
                {question.type === 'rating' ? (
                  <fieldset>
                    <legend>{question.label}</legend>
                    <div className="row" role="radiogroup" aria-label={question.label}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={answers[question.key] === value}
                          aria-label={`${value} av 5`}
                          className="icon-btn"
                          onClick={() => setAnswers({ ...answers, [question.key]: value })}
                          style={{ color: value <= Number(answers[question.key] ?? 0) ? 'var(--brand-accent)' : 'var(--text-subtle)' }}
                        >
                          <StarIcon size={24} filled={value <= Number(answers[question.key] ?? 0)} />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : question.type === 'boolean' ? (
                  <fieldset>
                    <legend>{question.label}</legend>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      {[true, false].map((value) => (
                        <button
                          key={String(value)}
                          type="button"
                          className="chip"
                          aria-pressed={answers[question.key] === value}
                          onClick={() => setAnswers({ ...answers, [question.key]: value })}
                        >
                          {value ? t('common.yes') : t('common.no')}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : question.type === 'single_choice' && question.options ? (
                  <fieldset>
                    <legend>{question.label}</legend>
                    <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                      {question.options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="chip"
                          aria-pressed={answers[question.key] === option.value}
                          onClick={() => setAnswers({ ...answers, [question.key]: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <Field label={question.label} optional={!question.required}>
                    {({ id }) => (
                      <Textarea
                        id={id}
                        rows={3}
                        value={String(answers[question.key] ?? '')}
                        onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })}
                      />
                    )}
                  </Field>
                )}
              </div>
            ))}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
