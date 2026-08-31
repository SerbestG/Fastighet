import { useState } from 'react';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDate } from '../lib/format.js';
import { Banner, Button, Checkbox, EmptyState, Field, Input, Progress, QueryBoundary, Sheet, Textarea } from '../components/ui.js';
import { BoxIcon, CheckIcon } from '../components/icons.js';

interface MoveFlow {
  id: string;
  kind: 'move_in' | 'move_out';
  move_date: string | null;
  status: string;
  object_number: string;
  property_street: string;
  steps: {
    id: string;
    key: string;
    title: string;
    description: string | null;
    status: 'pending' | 'in_progress' | 'done' | 'not_applicable';
    required: boolean;
  }[];
  defects: { id: string; space: string; description: string; created_at: string }[];
}

/** Checklistor för hela boenderesan, in och ut. */
export function MovingPage() {
  const { t } = useI18n();
  const { me } = useAuth();
  const toast = useToast();
  const state = useQuery<{ flows: MoveFlow[] }>('/api/move-flows');
  const [defectOpen, setDefectOpen] = useState<string | null>(null);
  const [defect, setDefect] = useState({ space: '', description: '' });
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminate, setTerminate] = useState({ requestedEndDate: '', newAddress: '', confirm: false });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const tenancy = me?.tenancies[0];

  const toggleStep = async (stepId: string, done: boolean) => {
    try {
      await api.patch(`/api/move-steps/${stepId}`, { status: done ? 'done' : 'pending' });
      state.reload();
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    }
  };

  const reportDefect = async () => {
    if (!defectOpen) return;
    setPending(true);
    try {
      await api.post(`/api/move-flows/${defectOpen}/defects`, defect);
      toast.show('Bristen är anmäld.');
      setDefectOpen(null);
      setDefect({ space: '', description: '' });
      state.reload();
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    } finally {
      setPending(false);
    }
  };

  const submitTermination = async () => {
    if (!tenancy) return;
    setPending(true);
    setError(null);
    try {
      await api.post('/api/tenancies/terminate', {
        tenancyId: tenancy.id,
        requestedEndDate: terminate.requestedEndDate,
        newAddress: terminate.newAddress || undefined,
        confirm: true,
      });
      toast.show('Din uppsägning är registrerad.');
      setTerminateOpen(false);
      state.reload();
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page stack stack-6">
      <header className="page-header">
        <h1>{t('nav.moving')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.flows.length === 0,
          render: <EmptyState icon={<BoxIcon size={24} />} title="Inga pågående flyttar" body="Här samlas checklistorna vid in- och utflyttning." />,
        }}
      >
        {(data) => (
          <>
            {data.flows.map((flow) => {
              const done = flow.steps.filter((step) => step.status === 'done').length;
              return (
                <section className="stack stack-4" key={flow.id}>
                  <div className="card stack stack-3">
                    <div className="row-between">
                      <div>
                        <h2>{flow.kind === 'move_in' ? t('moving.moveIn') : t('moving.moveOut')}</h2>
                        <p className="small muted">
                          {flow.property_street} · {flow.object_number}
                          {flow.move_date ? ` · ${formatDate(flow.move_date)}` : ''}
                        </p>
                      </div>
                      <span className="strong num">
                        {done}/{flow.steps.length}
                      </span>
                    </div>
                    <Progress value={done} max={flow.steps.length} label="Framsteg i checklistan" />
                  </div>

                  <ul className="steps card">
                    {flow.steps.map((step) => (
                      <li className="step" data-status={step.status} key={step.id}>
                        <span className="step-marker" aria-hidden="true">
                          {step.status === 'done' ? <CheckIcon size={13} /> : null}
                        </span>
                        <div className="grow">
                          <div className="strong">{step.title}</div>
                          {step.description ? <div className="small muted">{step.description}</div> : null}
                          {step.key === 'report_defects' && flow.defects.length ? (
                            <ul className="small muted" style={{ marginTop: 'var(--space-2)' }}>
                              {flow.defects.map((item) => (
                                <li key={item.id}>
                                  {item.space}: {item.description}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="row" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-2)' }}>
                            <Button
                              size="sm"
                              variant={step.status === 'done' ? 'ghost' : 'secondary'}
                              onClick={() => void toggleStep(step.id, step.status !== 'done')}
                            >
                              {step.status === 'done' ? 'Ångra' : t('moving.stepDone')}
                            </Button>
                            {step.key === 'report_defects' ? (
                              <Button size="sm" variant="ghost" onClick={() => setDefectOpen(flow.id)}>
                                Anmäl brist
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {tenancy && tenancy.status !== 'notice_given' ? (
              <section className="card stack stack-3">
                <h2>{t('moving.terminate')}</h2>
                <p className="small muted">
                  Uppsägningen är bindande. Tidigast möjliga datum för utflytt är
                  {tenancy.earliest_move_out ? ` ${formatDate(tenancy.earliest_move_out)}` : ' enligt ditt avtal'}.
                </p>
                <Button variant="danger" onClick={() => setTerminateOpen(true)}>
                  {t('moving.terminate')}
                </Button>
              </section>
            ) : null}
          </>
        )}
      </QueryBoundary>

      {defectOpen ? (
        <Sheet
          title="Anmäl brist"
          onClose={() => setDefectOpen(null)}
          footer={
            <Button
              variant="primary"
              block
              loading={pending}
              disabled={!defect.space || !defect.description}
              onClick={() => void reportDefect()}
            >
              {t('common.send')}
            </Button>
          }
        >
          <div className="stack stack-4">
            <p className="small muted">
              Brister du anmäler nu dokumenteras och belastar dig inte vid utflytt.
            </p>
            <Field label="Utrymme">
              {({ id }) => <Input id={id} value={defect.space} onChange={(event) => setDefect({ ...defect, space: event.target.value })} />}
            </Field>
            <Field label="Beskrivning">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={defect.description}
                  onChange={(event) => setDefect({ ...defect, description: event.target.value })}
                  rows={4}
                />
              )}
            </Field>
          </div>
        </Sheet>
      ) : null}

      {terminateOpen ? (
        <Sheet
          title={t('moving.terminate')}
          onClose={() => setTerminateOpen(false)}
          footer={
            <Button
              variant="danger"
              block
              loading={pending}
              disabled={!terminate.requestedEndDate || !terminate.confirm}
              onClick={() => void submitTermination()}
            >
              Säg upp bostaden
            </Button>
          }
        >
          <div className="stack stack-4">
            {error ? <Banner tone="critical" title={error.message} /> : null}
            <Field label="Önskat datum för utflytt" error={error?.fieldErrors.requestedEndDate}>
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={terminate.requestedEndDate}
                  min={tenancy?.earliest_move_out?.slice(0, 10)}
                  onChange={(event) => setTerminate({ ...terminate, requestedEndDate: event.target.value })}
                />
              )}
            </Field>
            <Field label="Ny adress" optional>
              {({ id }) => (
                <Input
                  id={id}
                  value={terminate.newAddress}
                  onChange={(event) => setTerminate({ ...terminate, newAddress: event.target.value })}
                />
              )}
            </Field>
            <Checkbox
              checked={terminate.confirm}
              onChange={(checked) => setTerminate({ ...terminate, confirm: checked })}
              label={t('moving.terminateConfirm')}
            />
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
