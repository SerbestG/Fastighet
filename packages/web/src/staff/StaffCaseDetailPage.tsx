import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CASE_TRANSITIONS,
  categoryLabel,
  spaceLabel,
  subcategoryLabel,
  triageSummary,
  type CaseStatus,
} from '@hemvist/shared';
import { ApiError, api, openProtectedFile } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatAmount, formatDateTime, formatDayMonth, formatTime, relativeTime } from '../lib/format.js';
import {
  Banner,
  Button,
  DefinitionList,
  Field,
  Input,
  Pill,
  QueryBoundary,
  Sheet,
  Tabs,
  Textarea,
} from '../components/ui.js';
import { ChevronLeft, DownloadIcon, LinkIcon, ToolboxIcon } from '../components/icons.js';

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

interface Detail {
  case: Record<string, unknown> & {
    id: string;
    case_number: string;
    title: string;
    description: string;
    status: CaseStatus;
    priority: string;
    sensitive: boolean;
    escalated: boolean;
    allow_master_key: boolean;
    has_pets: boolean;
    pet_notes: string | null;
    contact_phone: string | null;
    triage_answers: Record<string, string>;
    category_key: string;
    subcategory_key: string;
    space: string | null;
    created_at: string;
    sla_resolve_at: string | null;
    cost_estimate_ore: number | null;
    cost_actual_ore: number | null;
    object_number: string | null;
    unit_label: string | null;
    property_street: string | null;
    property_name: string | null;
    area_name: string | null;
    assignee_id: string | null;
    assignee_first_name: string | null;
    reporter_first_name: string | null;
    reporter_last_name: string | null;
    reporter_phone: string | null;
    team_name: string | null;
  };
  events: { id: string; at: string; kind: string; to_status: string | null; first_name: string | null }[];
  comments: { id: string; body: string; internal: boolean; created_at: string; first_name: string | null; from_staff: boolean }[];
  attachments: { id: string; file_id: string; original_name: string; size_bytes: number }[];
  visits: { id: string; starts_at: string; ends_at: string; status: string; resource_name: string }[];
  relatedCases: { id: string; case_number: string; title: string; status: string; kind: string }[];
  workOrders: { id: string; number: string; title: string; status: string; contractor_name: string | null; minutes_spent: number | null }[];
  similarInBuilding: { id: string; case_number: string; title: string; status: string; created_at: string }[];
  tenancyHistory: { id: string; case_number: string; title: string; status: string; created_at: string }[];
}

/** Handläggarens vy: hela ärendet, intern dialog och åtgärder på ett ställe. */
export function StaffCaseDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useQuery<Detail>(id ? `/api/staff/cases/${id}` : null);
  const assignees = useQuery<{ assignees: { id: string; first_name: string; last_name: string }[] }>('/api/staff/assignees');
  const contractors = useQuery<{ contractors: { id: string; name: string }[] }>(
    can('workorder:write') ? '/api/staff/contractors' : null,
  );

  const [tab, setTab] = useState<'timeline' | 'internal' | 'related'>('timeline');
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [pending, setPending] = useState(false);
  const [workOrderOpen, setWorkOrderOpen] = useState(false);
  const [workOrder, setWorkOrder] = useState({ title: '', instructions: '', contractorOrgId: '' });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeIds, setMergeIds] = useState<string[]>([]);

  const act = async (fn: () => Promise<unknown>, message: string) => {
    setPending(true);
    try {
      await fn();
      toast.show(message);
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="page-wide stack stack-5">
      <div className="row">
        <button type="button" className="icon-btn" onClick={() => navigate('/arenden')} aria-label={t('common.back')}>
          <ChevronLeft />
        </button>
        <h1 className="grow" style={{ fontSize: 'var(--text-xl)' }}>
          {state.data?.case.case_number ?? t('case.title')}
        </h1>
      </div>

      <QueryBoundary state={state}>
        {(data) => {
          const nextStatuses = CASE_TRANSITIONS[data.case.status] ?? [];
          return (
            <div className="detail-layout">
              <div className="stack stack-5">
                <section className="card stack stack-3">
                  <div className="row-between row-start">
                    <div className="grow">
                      <h2>{data.case.title}</h2>
                      <p className="small muted">
                        {data.case.property_street}
                        {data.case.unit_label ? `, lgh ${data.case.unit_label}` : ''} · {data.case.object_number}
                      </p>
                    </div>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      {data.case.sensitive ? <Pill tone="warning">Känsligt</Pill> : null}
                      {data.case.priority === 'emergency' ? <Pill tone="critical">Akut</Pill> : null}
                      <Pill tone="info">{STATUS_LABEL[data.case.status]}</Pill>
                    </div>
                  </div>
                  <p>{data.case.description}</p>

                  {(() => {
                    const triage = triageSummary(
                      data.case.category_key,
                      data.case.subcategory_key,
                      data.case.triage_answers ?? {},
                    );
                    return triage.length ? (
                      <div className="card" style={{ background: 'var(--surface-sunken)' }}>
                        <div className="section-title">Svar på följdfrågor</div>
                        <DefinitionList
                          items={triage.map((answer) => ({
                            label: answer.label,
                            // Svaret som gjorde ärendet akut markeras tydligt.
                            value: answer.escalating ? (
                              <span style={{ color: 'var(--status-critical)' }}>{answer.value}</span>
                            ) : (
                              answer.value
                            ),
                          }))}
                        />
                      </div>
                    ) : null;
                  })()}

                  <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                    {data.case.allow_master_key ? <span className="tag">Huvudnyckel godkänd</span> : <span className="tag">Ingen huvudnyckel</span>}
                    {data.case.has_pets ? <span className="tag">Husdjur{data.case.pet_notes ? `: ${data.case.pet_notes}` : ''}</span> : null}
                    {data.case.contact_phone ? <span className="tag">Tel: {data.case.contact_phone}</span> : null}
                    <span className="tag">
                      {categoryLabel(data.case.category_key)} ·{' '}
                      {subcategoryLabel(data.case.category_key, data.case.subcategory_key)}
                    </span>
                    {data.case.space ? <span className="tag">{spaceLabel(data.case.space)}</span> : null}
                  </div>
                </section>

                {data.attachments.length ? (
                  <section className="card stack stack-2">
                    <h3 className="section-title" style={{ margin: 0 }}>
                      Bilagor
                    </h3>
                    {data.attachments.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        className="row-between"
                        style={{ background: 'none', border: 0, padding: 'var(--space-2) 0', cursor: 'pointer', width: '100%' }}
                        onClick={() => void openProtectedFile(file.file_id, file.original_name)}
                      >
                        <span className="small">{file.original_name}</span>
                        <DownloadIcon size={16} />
                      </button>
                    ))}
                  </section>
                ) : null}

                <Tabs
                  label="Ärendevy"
                  active={tab}
                  onChange={setTab}
                  tabs={[
                    { value: 'timeline', label: 'Historik' },
                    { value: 'internal', label: 'Dialog', count: data.comments.length },
                    { value: 'related', label: t('staff.relatedCases'), count: data.similarInBuilding.length + data.relatedCases.length },
                  ]}
                />

                {tab === 'timeline' ? (
                  <ol className="timeline">
                    {data.events.map((event) => (
                      <li key={event.id}>
                        <div className="when">{formatDateTime(event.at)}</div>
                        <div className="what">
                          {event.to_status ? STATUS_LABEL[event.to_status] : event.kind}
                        </div>
                        {event.first_name ? <div className="small muted">{event.first_name}</div> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}

                {tab === 'internal' ? (
                  <div className="stack stack-4">
                    {data.comments.map((comment) => (
                      <div
                        className="card"
                        key={comment.id}
                        style={{
                          background: comment.internal ? 'var(--status-warning-soft)' : 'var(--surface-raised)',
                          borderStyle: comment.internal ? 'dashed' : 'solid',
                        }}
                      >
                        <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                          <span className="small strong">
                            {comment.first_name ?? 'Okänd'}
                            {comment.internal ? ' · intern anteckning' : comment.from_staff ? ' · svar till hyresgäst' : ' · hyresgäst'}
                          </span>
                          <span className="xs subtle">{relativeTime(comment.created_at)}</span>
                        </div>
                        <p style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</p>
                      </div>
                    ))}

                    <div className="card stack stack-3">
                      <Field label={t('staff.replyToTenant')} hint="Skickas till hyresgästen och syns i appen.">
                        {({ id: fid }) => <Textarea id={fid} rows={3} value={reply} onChange={(event) => setReply(event.target.value)} />}
                      </Field>
                      <Button
                        variant="primary"
                        disabled={!reply.trim()}
                        loading={pending}
                        onClick={() =>
                          void act(async () => {
                            await api.post(`/api/cases/${data.case.id}/comments`, { body: reply, internal: false });
                            setReply('');
                          }, 'Svaret är skickat till hyresgästen.')
                        }
                      >
                        {t('common.send')}
                      </Button>
                    </div>

                    <div className="card stack stack-3" style={{ borderStyle: 'dashed' }}>
                      <Field label={t('staff.internalNote')} hint="Syns aldrig för hyresgästen.">
                        {({ id: fid }) => (
                          <Textarea id={fid} rows={2} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
                        )}
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={!internalNote.trim()}
                        loading={pending}
                        onClick={() =>
                          void act(async () => {
                            await api.post(`/api/cases/${data.case.id}/comments`, { body: internalNote, internal: true });
                            setInternalNote('');
                          }, 'Anteckningen är sparad.')
                        }
                      >
                        Spara anteckning
                      </Button>
                    </div>
                  </div>
                ) : null}

                {tab === 'related' ? (
                  <div className="stack stack-4">
                    {data.similarInBuilding.length ? (
                      <section className="stack stack-2">
                        <Banner tone="warning" title="Liknande ärenden i samma byggnad">
                          <p className="small">
                            Flera hyresgäster kan rapportera samma problem. Slå ihop dubbletter så att arbetet
                            bara görs en gång.
                          </p>
                        </Banner>
                        <div className="card card-flush">
                          {data.similarInBuilding.map((item) => (
                            <div className="list-item" key={item.id} style={{ cursor: 'default' }}>
                              <label className="row grow" style={{ cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={mergeIds.includes(item.id)}
                                  onChange={(event) =>
                                    setMergeIds((current) =>
                                      event.target.checked ? [...current, item.id] : current.filter((value) => value !== item.id),
                                    )
                                  }
                                />
                                <span className="grow">
                                  <span className="list-title">{item.title}</span>
                                  <span className="list-meta">
                                    {item.case_number} · {STATUS_LABEL[item.status]} · {formatDayMonth(item.created_at)}
                                  </span>
                                </span>
                              </label>
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/arenden/${item.id}`)}>
                                Öppna
                              </Button>
                            </div>
                          ))}
                        </div>
                        {can('case:merge') && mergeIds.length ? (
                          <Button variant="secondary" icon={<LinkIcon size={16} />} onClick={() => setMergeOpen(true)}>
                            {t('staff.merge')} ({mergeIds.length})
                          </Button>
                        ) : null}
                      </section>
                    ) : null}

                    {data.relatedCases.length ? (
                      <section className="stack stack-2">
                        <h3 className="section-title" style={{ margin: 0 }}>
                          Kopplade ärenden
                        </h3>
                        <div className="card card-flush">
                          {data.relatedCases.map((item) => (
                            <button key={item.id} type="button" className="list-item" onClick={() => navigate(`/arenden/${item.id}`)}>
                              <span className="grow">
                                <span className="list-title">{item.title}</span>
                                <span className="list-meta">
                                  {item.case_number} · {item.kind === 'merged' ? 'Sammanslaget' : 'Relaterat'}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {data.tenancyHistory.length ? (
                      <section className="stack stack-2">
                        <h3 className="section-title" style={{ margin: 0 }}>
                          Tidigare ärenden på objektet
                        </h3>
                        <div className="card card-flush">
                          {data.tenancyHistory.map((item) => (
                            <button key={item.id} type="button" className="list-item" onClick={() => navigate(`/arenden/${item.id}`)}>
                              <span className="grow">
                                <span className="list-title">{item.title}</span>
                                <span className="list-meta">
                                  {item.case_number} · {formatDayMonth(item.created_at)}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* ------------------------------------------------ sidopanel --- */}
              <aside className="stack stack-4">
                <section className="card stack stack-3">
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Åtgärder
                  </h3>
                  <Field label="Status">
                    {({ id: fid }) => (
                      <select
                        className="select"
                        id={fid}
                        value=""
                        onChange={(event) =>
                          event.target.value &&
                          void act(
                            () => api.patch(`/api/staff/cases/${data.case.id}`, { status: event.target.value }),
                            'Statusen är uppdaterad.',
                          )
                        }
                      >
                        <option value="">Ändra status…</option>
                        {nextStatuses.map((status) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>

                  {can('case:assign') ? (
                    <Field label={t('staff.assign')}>
                      {({ id: fid }) => (
                        <select
                          className="select"
                          id={fid}
                          value={data.case.assignee_id ?? ''}
                          onChange={(event) =>
                            void act(
                              () =>
                                api.patch(`/api/staff/cases/${data.case.id}`, {
                                  assigneeId: event.target.value || null,
                                }),
                              'Ärendet är tilldelat.',
                            )
                          }
                        >
                          <option value="">Ej tilldelat</option>
                          {(assignees.data?.assignees ?? []).map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.first_name} {person.last_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  ) : null}

                  <Field label="Prioritet">
                    {({ id: fid }) => (
                      <select
                        className="select"
                        id={fid}
                        value={data.case.priority}
                        onChange={(event) =>
                          void act(
                            () => api.patch(`/api/staff/cases/${data.case.id}`, { priority: event.target.value }),
                            'Prioriteten är ändrad.',
                          )
                        }
                      >
                        <option value="emergency">Akut</option>
                        <option value="high">Hög</option>
                        <option value="normal">Normal</option>
                        <option value="low">Låg</option>
                      </select>
                    )}
                  </Field>

                  {can('workorder:write') ? (
                    <Button variant="secondary" icon={<ToolboxIcon size={16} />} onClick={() => setWorkOrderOpen(true)}>
                      Skapa arbetsorder
                    </Button>
                  ) : null}
                </section>

                <section className="card stack stack-3">
                  <h3 className="section-title" style={{ margin: 0 }}>
                    Uppgifter
                  </h3>
                  <DefinitionList
                    items={[
                      { label: 'Skapat', value: formatDateTime(data.case.created_at) },
                      {
                        label: 'Ska vara klart',
                        value: data.case.sla_resolve_at ? formatDateTime(data.case.sla_resolve_at) : '–',
                      },
                      { label: 'Grupp', value: data.case.team_name ?? '–' },
                      {
                        label: 'Anmälare',
                        value: data.case.reporter_first_name
                          ? `${data.case.reporter_first_name} ${data.case.reporter_last_name ?? ''}`
                          : '–',
                      },
                      { label: 'Telefon', value: data.case.reporter_phone ?? data.case.contact_phone ?? '–' },
                      {
                        label: 'Kostnad',
                        value: data.case.cost_actual_ore ? formatAmount(data.case.cost_actual_ore) : '–',
                      },
                    ]}
                  />
                </section>

                {data.visits.length ? (
                  <section className="card stack stack-2">
                    <h3 className="section-title" style={{ margin: 0 }}>
                      Bokade besök
                    </h3>
                    {data.visits.map((visit) => (
                      <div className="row-between" key={visit.id}>
                        <span className="small">
                          {formatDayMonth(visit.starts_at)} {formatTime(visit.starts_at)}–{formatTime(visit.ends_at)}
                        </span>
                        <Pill tone={visit.status === 'cancelled' ? 'neutral' : 'success'}>
                          {visit.status === 'cancelled' ? 'Avbokat' : 'Bokat'}
                        </Pill>
                      </div>
                    ))}
                  </section>
                ) : null}

                {data.workOrders.length ? (
                  <section className="card stack stack-2">
                    <h3 className="section-title" style={{ margin: 0 }}>
                      Arbetsorder
                    </h3>
                    {data.workOrders.map((order) => (
                      <div className="row-between" key={order.id}>
                        <span className="small">
                          {order.number} · {order.contractor_name ?? 'Egen personal'}
                        </span>
                        <Pill tone={order.status === 'completed' ? 'success' : 'info'}>{order.status}</Pill>
                      </div>
                    ))}
                  </section>
                ) : null}
              </aside>

              {workOrderOpen ? (
                <Sheet
                  title="Skapa arbetsorder"
                  onClose={() => setWorkOrderOpen(false)}
                  footer={
                    <Button
                      variant="primary"
                      block
                      loading={pending}
                      disabled={!workOrder.title}
                      onClick={() =>
                        void act(async () => {
                          await api.post('/api/staff/work-orders', {
                            caseId: data.case.id,
                            title: workOrder.title,
                            instructions: workOrder.instructions || undefined,
                            contractorOrgId: workOrder.contractorOrgId || undefined,
                          });
                          setWorkOrderOpen(false);
                          setWorkOrder({ title: '', instructions: '', contractorOrgId: '' });
                        }, 'Arbetsordern är skapad.')
                      }
                    >
                      {t('common.create')}
                    </Button>
                  }
                >
                  <div className="stack stack-4">
                    <Field label="Titel">
                      {({ id: fid }) => (
                        <Input id={fid} value={workOrder.title} onChange={(event) => setWorkOrder({ ...workOrder, title: event.target.value })} />
                      )}
                    </Field>
                    <Field label="Instruktioner" optional>
                      {({ id: fid }) => (
                        <Textarea
                          id={fid}
                          rows={4}
                          value={workOrder.instructions}
                          onChange={(event) => setWorkOrder({ ...workOrder, instructions: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Entreprenör" optional hint="Lämna tomt om arbetet görs av egen personal.">
                      {({ id: fid }) => (
                        <select
                          className="select"
                          id={fid}
                          value={workOrder.contractorOrgId}
                          onChange={(event) => setWorkOrder({ ...workOrder, contractorOrgId: event.target.value })}
                        >
                          <option value="">Egen personal</option>
                          {(contractors.data?.contractors ?? []).map((contractor) => (
                            <option key={contractor.id} value={contractor.id}>
                              {contractor.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                  </div>
                </Sheet>
              ) : null}

              {mergeOpen ? (
                <Sheet
                  title={t('staff.merge')}
                  onClose={() => setMergeOpen(false)}
                  footer={
                    <Button
                      variant="primary"
                      block
                      loading={pending}
                      onClick={() =>
                        void act(async () => {
                          await api.post(`/api/staff/cases/${data.case.id}/merge`, { sourceCaseIds: mergeIds });
                          setMergeOpen(false);
                          setMergeIds([]);
                        }, 'Ärendena är sammanslagna.')
                      }
                    >
                      Slå ihop {mergeIds.length} ärenden
                    </Button>
                  }
                >
                  <p>
                    De valda ärendena avslutas och kopplas till {data.case.case_number}. Hyresgästerna
                    får fortsatt information via sina egna ärenden.
                  </p>
                </Sheet>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
