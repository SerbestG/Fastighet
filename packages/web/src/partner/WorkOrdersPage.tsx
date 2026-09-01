import { useState } from 'react';
import { spaceLabel } from '@hemvist/shared';
import { ApiError, api, uploadFiles } from '../lib/api.js';
import { prepareForUpload } from '../lib/images.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import {
  Banner,
  Button,
  EmptyState,
  Field,
  Input,
  Pill,
  QueryBoundary,
  Sheet,
  Tabs,
  Textarea,
} from '../components/ui.js';
import { CameraIcon, PhoneIcon, ToolboxIcon } from '../components/icons.js';

interface WorkOrder {
  id: string;
  number: string;
  title: string;
  instructions: string | null;
  status: string;
  planned_start: string | null;
  planned_end: string | null;
  accepted_at: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  blocker_reason: string | null;
  minutes_spent: number | null;
  notes: string | null;
  case_number: string;
  priority: string;
  category_key: string;
  subcategory_key: string;
  space: string | null;
  case_description: string;
  allow_master_key: boolean;
  has_pets: boolean;
  pet_notes: string | null;
  access_windows: { weekday: number; from: string; to: string }[];
  object_number: string | null;
  unit_label: string | null;
  entrance_name: string | null;
  property_street: string | null;
  property_city: string | null;
  building_name: string | null;
  contact_first_name: string | null;
  contact_phone: string | null;
}

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'critical' | 'info' | 'neutral' }> = {
  offered: { label: 'Ny förfrågan', tone: 'warning' },
  accepted: { label: 'Accepterad', tone: 'info' },
  scheduled: { label: 'Planerad', tone: 'info' },
  on_site: { label: 'På plats', tone: 'warning' },
  blocked: { label: 'Hinder', tone: 'critical' },
  completed: { label: 'Klar', tone: 'success' },
  declined: { label: 'Avböjd', tone: 'neutral' },
};

const WEEKDAY = ['Sön', 'Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör'];

export function WorkOrdersPage() {
  const { t } = useI18n();
  const toast = useToast();
  const state = useQuery<{ workOrders: WorkOrder[] }>('/api/partner/work-orders');
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [completing, setCompleting] = useState<WorkOrder | null>(null);
  const [blocking, setBlocking] = useState<WorkOrder | null>(null);
  const [report, setReport] = useState({ notes: '', hours: '', materialDescription: '', materialQuantity: '1', materialCost: '' });
  const [blockerReason, setBlockerReason] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const act = async (id: string, body: Record<string, unknown>, message: string) => {
    setPending(true);
    try {
      await api.patch(`/api/partner/work-orders/${id}`, body);
      toast.show(message);
      state.reload();
      setCompleting(null);
      setBlocking(null);
      setReport({ notes: '', hours: '', materialDescription: '', materialQuantity: '1', materialCost: '' });
      setAttachmentIds([]);
      setBlockerReason('');
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    } finally {
      setPending(false);
    }
  };

  const addPhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const prepared = await prepareForUpload([...files]);
      const uploaded = await uploadFiles(prepared.map((item) => item.file));
      setAttachmentIds((current) => [...current, ...uploaded.map((file) => file.id)]);
      toast.show(`${uploaded.length} bild(er) tillagda.`);
    } catch (caught) {
      const error = caught as ApiError;
      toast.show(error.message, 'error', error.traceId);
    }
  };

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('contractor.workOrders')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.workOrders.length === 0,
          render: <EmptyState icon={<ToolboxIcon size={24} />} title="Inga arbetsorder" body="Nya uppdrag visas här." />,
        }}
      >
        {(data) => {
          const active = data.workOrders.filter((order) => !['completed', 'declined'].includes(order.status));
          const done = data.workOrders.filter((order) => ['completed', 'declined'].includes(order.status));
          const list = tab === 'active' ? active : done;

          return (
            <>
              <Tabs
                label="Filter"
                active={tab}
                onChange={setTab}
                tabs={[
                  { value: 'active', label: 'Pågående', count: active.length },
                  { value: 'done', label: 'Avslutade', count: done.length },
                ]}
              />

              {list.length === 0 ? (
                <EmptyState title={tab === 'active' ? 'Inga pågående uppdrag' : 'Inga avslutade uppdrag'} />
              ) : (
                <div className="stack stack-4">
                  {list.map((order) => {
                    const status = STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
                    return (
                      <article className="card stack stack-4" key={order.id}>
                        <div className="row-between row-start">
                          <div className="grow">
                            <h2 style={{ fontSize: 'var(--text-lg)' }}>{order.title}</h2>
                            <p className="small muted">
                              {order.number} · Ärende {order.case_number}
                            </p>
                          </div>
                          <div className="row" style={{ gap: 'var(--space-2)' }}>
                            {order.priority === 'emergency' ? <Pill tone="critical">Akut</Pill> : null}
                            <Pill tone={status.tone}>{status.label}</Pill>
                          </div>
                        </div>

                        <div className="card" style={{ background: 'var(--surface-sunken)' }}>
                          <div className="section-title">Adress</div>
                          <div className="strong">
                            {order.property_street}
                            {order.unit_label ? `, lgh ${order.unit_label}` : ''}
                          </div>
                          <div className="small muted">
                            {order.entrance_name ? `Trapphus ${order.entrance_name} · ` : ''}
                            {order.object_number} · {order.property_city}
                          </div>
                        </div>

                        <div>
                          <div className="section-title">Beskrivning</div>
                          <p>{order.case_description}</p>
                          {order.instructions ? (
                            <>
                              <div className="section-title" style={{ marginTop: 'var(--space-3)' }}>
                                Instruktioner
                              </div>
                              <p>{order.instructions}</p>
                            </>
                          ) : null}
                        </div>

                        <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                          <span className="tag">{order.allow_master_key ? 'Huvudnyckel godkänd' : 'Ingen huvudnyckel'}</span>
                          {order.has_pets ? <span className="tag">Husdjur{order.pet_notes ? `: ${order.pet_notes}` : ''}</span> : null}
                          {order.space ? <span className="tag">Utrymme: {spaceLabel(order.space)}</span> : null}
                          {order.access_windows?.length
                            ? order.access_windows.map((window, index) => (
                                <span className="tag" key={index}>
                                  {WEEKDAY[window.weekday]} {window.from}–{window.to}
                                </span>
                              ))
                            : null}
                        </div>

                        {order.contact_phone ? (
                          <a className="btn btn-secondary btn-sm" href={`tel:${order.contact_phone}`}>
                            <PhoneIcon size={16} /> Ring {order.contact_first_name ?? 'hyresgästen'} {order.contact_phone}
                          </a>
                        ) : (
                          <p className="xs subtle">
                            Kontaktuppgifter lämnas ut när du accepterat uppdraget.
                          </p>
                        )}

                        {order.blocker_reason ? (
                          <Banner tone="warning" title="Rapporterat hinder">
                            <p className="small">{order.blocker_reason}</p>
                          </Banner>
                        ) : null}

                        {order.completed_at ? (
                          <p className="small muted">
                            Klar {formatDateTime(order.completed_at)}
                            {order.minutes_spent ? ` · ${Math.round((order.minutes_spent / 60) * 10) / 10} tim` : ''}
                          </p>
                        ) : null}

                        <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
                          {order.status === 'offered' ? (
                            <>
                              <Button variant="primary" loading={pending} onClick={() => void act(order.id, { status: 'accepted' }, 'Uppdraget är accepterat.')}>
                                {t('contractor.accept')}
                              </Button>
                              <Button variant="danger" loading={pending} onClick={() => void act(order.id, { status: 'declined' }, 'Uppdraget är avböjt.')}>
                                {t('contractor.decline')}
                              </Button>
                            </>
                          ) : null}
                          {['accepted', 'scheduled', 'blocked'].includes(order.status) ? (
                            <Button variant="primary" loading={pending} onClick={() => void act(order.id, { status: 'on_site' }, 'Ankomst registrerad.')}>
                              {t('contractor.checkIn')}
                            </Button>
                          ) : null}
                          {['accepted', 'scheduled', 'on_site', 'blocked'].includes(order.status) ? (
                            <>
                              <Button variant="secondary" onClick={() => setCompleting(order)}>
                                {t('contractor.complete')}
                              </Button>
                              <Button variant="ghost" onClick={() => setBlocking(order)}>
                                {t('contractor.blocker')}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          );
        }}
      </QueryBoundary>

      {completing ? (
        <Sheet
          title={t('contractor.complete')}
          onClose={() => setCompleting(null)}
          footer={
            <Button
              variant="primary"
              block
              loading={pending}
              onClick={() =>
                void act(
                  completing.id,
                  {
                    status: 'completed',
                    notes: report.notes || undefined,
                    minutesSpent: report.hours ? Math.round(Number(report.hours) * 60) : undefined,
                    materials: report.materialDescription
                      ? [
                          {
                            description: report.materialDescription,
                            quantity: Number(report.materialQuantity) || 1,
                            unit: 'st',
                            unitCostOre: report.materialCost ? Math.round(Number(report.materialCost) * 100) : undefined,
                          },
                        ]
                      : undefined,
                    attachmentIds: attachmentIds.length ? attachmentIds : undefined,
                  },
                  'Uppdraget är markerat som klart.',
                )
              }
            >
              {t('contractor.complete')}
            </Button>
          }
        >
          <div className="stack stack-4">
            <Field label="Utfört arbete">
              {({ id }) => <Textarea id={id} rows={4} value={report.notes} onChange={(event) => setReport({ ...report, notes: event.target.value })} />}
            </Field>
            <Field label={t('contractor.timeSpent')} hint="Antal timmar, till exempel 1,5.">
              {({ id }) => <Input id={id} inputMode="decimal" value={report.hours} onChange={(event) => setReport({ ...report, hours: event.target.value.replace(',', '.') })} />}
            </Field>
            <fieldset>
              <legend>{t('contractor.materials')}</legend>
              <div className="stack stack-3">
                <Field label="Beskrivning" optional>
                  {({ id }) => (
                    <Input id={id} value={report.materialDescription} onChange={(event) => setReport({ ...report, materialDescription: event.target.value })} />
                  )}
                </Field>
                <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
                  <Field label="Antal" optional>
                    {({ id }) => (
                      <Input id={id} inputMode="decimal" value={report.materialQuantity} onChange={(event) => setReport({ ...report, materialQuantity: event.target.value })} />
                    )}
                  </Field>
                  <Field label="Pris per styck (kr)" optional>
                    {({ id }) => (
                      <Input id={id} inputMode="decimal" value={report.materialCost} onChange={(event) => setReport({ ...report, materialCost: event.target.value.replace(',', '.') })} />
                    )}
                  </Field>
                </div>
              </div>
            </fieldset>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              <CameraIcon size={18} />
              Dokumentera med bild ({attachmentIds.length})
              <input type="file" accept="image/*" multiple className="visually-hidden" onChange={(event) => void addPhoto(event.target.files)} />
            </label>
          </div>
        </Sheet>
      ) : null}

      {blocking ? (
        <Sheet
          title={t('contractor.blocker')}
          onClose={() => setBlocking(null)}
          footer={
            <Button
              variant="primary"
              block
              loading={pending}
              disabled={!blockerReason.trim()}
              onClick={() => void act(blocking.id, { status: 'blocked', blockerReason }, 'Hindret är rapporterat.')}
            >
              {t('common.send')}
            </Button>
          }
        >
          <div className="stack stack-4">
            <p className="small muted">
              Beskriv vad som hindrar arbetet. Förvaltaren får informationen direkt.
            </p>
            <Field label="Hinder">
              {({ id }) => <Textarea id={id} rows={4} value={blockerReason} onChange={(event) => setBlockerReason(event.target.value)} />}
            </Field>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
