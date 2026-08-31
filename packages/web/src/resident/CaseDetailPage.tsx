import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { categoryLabel, spaceLabel, subcategoryLabel } from '@hemvist/shared';
import { ApiError, api, openProtectedFile, uploadFiles } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime, formatDayMonth, formatTime, relativeTime } from '../lib/format.js';
import {
  Banner,
  Button,
  Field,
  Pill,
  QueryBoundary,
  Sheet,
  Textarea,
  DefinitionList,
} from '../components/ui.js';
import { CameraIcon, CheckIcon, ChevronLeft, DownloadIcon, StarIcon } from '../components/icons.js';

interface CaseDetail {
  case: {
    id: string;
    case_number: string;
    title: string;
    description: string;
    status: string;
    simpleStatus: string;
    priority: string;
    category_key: string;
    subcategory_key: string;
    space: string | null;
    created_at: string;
    allow_master_key: boolean;
    property_street: string | null;
    unit_label: string | null;
    assignee_first_name: string | null;
    team_name: string | null;
    contractor_name: string | null;
    triage_answers: Record<string, string>;
  };
  events: {
    id: string;
    at: string;
    kind: string;
    from_status: string | null;
    to_status: string | null;
    payload: Record<string, unknown>;
    first_name: string | null;
  }[];
  comments: { id: string; body: string; internal: boolean; created_at: string; first_name: string | null; from_staff: boolean }[];
  attachments: { id: string; file_id: string; original_name: string; mime_type: string; size_bytes: number }[];
  visits: { id: string; starts_at: string; ends_at: string; status: string; resource_name: string }[];
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

const EVENT_LABEL: Record<string, string> = {
  created: 'Felanmälan mottagen',
  status_changed: 'Status ändrad',
  assigned: 'Tilldelad handläggare',
  unassigned: 'Tilldelning borttagen',
  visit_booked: 'Besök bokat',
  comment: 'Nytt meddelande',
  work_order_created: 'Arbetsorder skapad',
  work_order_status: 'Arbetet uppdaterat',
  confirmed_by_resident: 'Du bekräftade att felet är löst',
  reopened: 'Ärendet öppnades igen',
  merged: 'Ärendet slogs ihop med ett annat',
};

/** Ärendet i realtid: tidslinje, dialog, bilagor och bokade besök. */
export function CaseDetailPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useQuery<CaseDetail>(id ? `/api/cases/${id}` : null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [uploading, setUploading] = useState(false);

  const sendComment = async (attachmentIds: string[] = []) => {
    if (!id || (!reply.trim() && attachmentIds.length === 0)) return;
    setSending(true);
    try {
      await api.post(`/api/cases/${id}/comments`, {
        body: reply.trim() || 'Bifogade en bild.',
        internal: false,
        attachmentIds,
      });
      setReply('');
      state.reload();
      toast.show('Ditt meddelande är skickat.');
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setSending(false);
    }
  };

  const addPhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles([...files]);
      await sendComment(uploaded.map((file) => file.id));
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setUploading(false);
    }
  };

  const confirmResolved = async () => {
    if (!id) return;
    try {
      await api.post(`/api/cases/${id}/confirm-resolved`, {});
      toast.show('Tack, ärendet är avslutat.');
      setFeedbackOpen(true);
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    }
  };

  const submitFeedback = async () => {
    if (!id || rating === 0) return;
    try {
      await api.post(`/api/cases/${id}/feedback`, { rating, resolved: true, comment: feedbackText || undefined });
      toast.show(t('survey.thanks'));
      setFeedbackOpen(false);
      state.reload();
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    }
  };

  return (
    <div className="page stack stack-5">
      <div className="row">
        <button type="button" className="icon-btn" onClick={() => navigate('/arenden')} aria-label={t('common.back')}>
          <ChevronLeft />
        </button>
        <h1 className="grow" style={{ fontSize: 'var(--text-xl)' }}>
          {t('case.title')}
        </h1>
      </div>

      <QueryBoundary state={state}>
        {(data) => (
          <>
            <section className="card stack stack-3">
              <div className="row-between row-start">
                <div className="grow">
                  <h2>{data.case.title}</h2>
                  <p className="small muted">
                    {data.case.case_number} · {formatDateTime(data.case.created_at)}
                  </p>
                </div>
                <Pill tone={data.case.status === 'awaiting_tenant' ? 'warning' : data.case.status === 'resolved' ? 'success' : 'info'}>
                  {STATUS_LABEL[data.case.status] ?? data.case.status}
                </Pill>
              </div>
              <p>{data.case.description}</p>
              {data.case.property_street ? (
                <p className="small muted">
                  {data.case.property_street}
                  {data.case.unit_label ? `, lägenhet ${data.case.unit_label}` : ''}
                </p>
              ) : null}
            </section>

            {data.case.status === 'awaiting_tenant' ? (
              <Banner tone="warning" title={t('case.awaitingYou')}>
                <p>Vi behöver ett svar från dig för att komma vidare.</p>
              </Banner>
            ) : null}

            {data.visits.length ? (
              <section className="card stack stack-3">
                <h3 className="section-title" style={{ margin: 0 }}>
                  {t('case.visitBooked')}
                </h3>
                {data.visits.map((visit) => (
                  <div className="row-between" key={visit.id}>
                    <div>
                      <div className="strong">
                        {formatDayMonth(visit.starts_at)} {formatTime(visit.starts_at)}–{formatTime(visit.ends_at)}
                      </div>
                      <div className="small muted">{visit.resource_name}</div>
                    </div>
                    <Pill tone={visit.status === 'cancelled' ? 'neutral' : 'success'}>
                      {visit.status === 'cancelled' ? 'Avbokat' : 'Bokat'}
                    </Pill>
                  </div>
                ))}
              </section>
            ) : null}

            {data.case.status === 'resolved' ? (
              <div className="stack stack-2">
                <Button variant="primary" block icon={<CheckIcon size={18} />} onClick={() => void confirmResolved()}>
                  {t('case.confirmResolved')}
                </Button>
                <Button variant="secondary" block onClick={() => setFeedbackOpen(true)}>
                  {t('case.feedback')}
                </Button>
              </div>
            ) : null}

            <section className="stack stack-3">
              <h3 className="section-title">{t('case.timeline')}</h3>
              <ol className="timeline">
                {data.events.map((event) => (
                  <li key={event.id}>
                    <div className="when">
                      {formatDayMonth(event.at)} {formatTime(event.at)}
                    </div>
                    <div className="what">
                      {event.kind === 'status_changed' && event.to_status
                        ? STATUS_LABEL[event.to_status]
                        : (EVENT_LABEL[event.kind] ?? event.kind)}
                    </div>
                    {event.first_name ? <div className="small muted">{event.first_name}</div> : null}
                  </li>
                ))}
              </ol>
            </section>

            {data.attachments.length ? (
              <section className="stack stack-3">
                <h3 className="section-title">{t('case.attachments')}</h3>
                <div className="card card-flush">
                  {data.attachments.map((file) => (
                    <button
                      type="button"
                      className="list-item"
                      key={file.id}
                      onClick={() => void openProtectedFile(file.file_id, file.original_name)}
                    >
                      <span className="grow">
                        <span className="list-title">{file.original_name}</span>
                        <span className="list-meta">{Math.round(file.size_bytes / 1024)} kB</span>
                      </span>
                      <DownloadIcon size={18} className="chevron" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="stack stack-3">
              <h3 className="section-title">Dialog</h3>
              {data.comments.length === 0 ? (
                <p className="small muted">Inga meddelanden ännu.</p>
              ) : (
                <div className="stack stack-3">
                  {data.comments.map((comment) => (
                    <div
                      className="card"
                      key={comment.id}
                      style={{
                        background: comment.from_staff ? 'var(--surface-primary-soft)' : 'var(--surface-raised)',
                      }}
                    >
                      <div className="row-between" style={{ marginBottom: 'var(--space-2)' }}>
                        <span className="small strong">
                          {comment.from_staff ? (comment.first_name ?? 'Förvaltningen') : 'Du'}
                        </span>
                        <span className="xs subtle">{relativeTime(comment.created_at)}</span>
                      </div>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{comment.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {['closed', 'cancelled'].includes(data.case.status) ? (
                <p className="small muted">Ärendet är avslutat och går inte att komplettera.</p>
              ) : (
                <div className="stack stack-2">
                  <Field label={t('case.addInfo')}>
                    {({ id: fieldId }) => (
                      <Textarea
                        id={fieldId}
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        placeholder="Skriv ett meddelande till förvaltningen"
                        rows={3}
                      />
                    )}
                  </Field>
                  <div className="row">
                    <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                      <CameraIcon size={18} />
                      {uploading ? 'Laddar upp…' : 'Bild'}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="visually-hidden"
                        onChange={(event) => void addPhoto(event.target.files)}
                      />
                    </label>
                    <Button
                      variant="primary"
                      className="grow"
                      loading={sending}
                      disabled={!reply.trim()}
                      onClick={() => void sendComment()}
                    >
                      {t('common.send')}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <details className="card">
              <summary className="strong" style={{ cursor: 'pointer' }}>
                Uppgifter i anmälan
              </summary>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <DefinitionList
                  items={[
                    { label: 'Kategori', value: categoryLabel(data.case.category_key) },
                    {
                      label: 'Typ',
                      value: subcategoryLabel(data.case.category_key, data.case.subcategory_key),
                    },
                    { label: 'Utrymme', value: spaceLabel(data.case.space) ?? '–' },
                    { label: 'Huvudnyckel', value: data.case.allow_master_key ? 'Godkänd' : 'Ej godkänd' },
                    { label: 'Handläggare', value: data.case.assignee_first_name ?? data.case.team_name ?? 'Fördelas' },
                    ...(data.case.contractor_name
                      ? [{ label: 'Entreprenör', value: data.case.contractor_name }]
                      : []),
                  ]}
                />
              </div>
            </details>

            {feedbackOpen ? (
              <Sheet
                title={t('case.feedback')}
                onClose={() => setFeedbackOpen(false)}
                footer={
                  <Button variant="primary" block disabled={rating === 0} onClick={() => void submitFeedback()}>
                    {t('common.send')}
                  </Button>
                }
              >
                <div className="stack stack-4">
                  <p>{t('case.feedbackQuestion')}</p>
                  <div className="row" role="radiogroup" aria-label={t('case.feedbackQuestion')}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} av 5`}
                        className="icon-btn"
                        onClick={() => setRating(value)}
                        style={{ color: value <= rating ? 'var(--brand-accent)' : 'var(--text-subtle)' }}
                      >
                        <StarIcon size={26} filled={value <= rating} />
                      </button>
                    ))}
                  </div>
                  <Field label="Något du vill lägga till?" optional>
                    {({ id: fid }) => (
                      <Textarea id={fid} value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} rows={3} />
                    )}
                  </Field>
                </div>
              </Sheet>
            ) : null}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
