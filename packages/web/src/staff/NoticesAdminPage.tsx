import { useEffect, useState } from 'react';
import { NOTICE_KINDS, type NoticeKind } from '@hemvist/shared';
import { ApiError, api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { formatDateTime } from '../lib/format.js';
import {
  Banner,
  Button,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Pill,
  QueryBoundary,
  Sheet,
  Tabs,
  Textarea,
} from '../components/ui.js';
import { MegaphoneIcon, PlusIcon } from '../components/icons.js';

const KIND_LABEL: Record<string, string> = {
  water_shutoff: 'Vattenavstängning',
  elevator_fault: 'Hissfel',
  power_outage: 'Elavbrott',
  heating: 'Värmeproblem',
  ventilation: 'Ventilationsarbete',
  noisy_work: 'Störande arbeten',
  planned_maintenance: 'Planerat underhåll',
  waste: 'Avfallshantering',
  snow_clearing: 'Snöröjning',
  safety: 'Säkerhetshändelse',
  news: 'Nyhet',
  event: 'Aktivitet',
  other: 'Övrigt',
};

interface NoticeRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  summary: string | null;
  status: string;
  publish_at: string | null;
  unpublish_at: string | null;
  pinned_until: string | null;
  published_at: string | null;
  created_at: string;
  channels: string[];
  requires_acknowledgement: boolean;
  read_count: number;
  acknowledged_count: number;
  audience: { scope: string; scopeId: string | null }[];
}

interface Structure {
  areas: {
    id: string;
    name: string;
    properties: { id: string; name: string; buildings: { id: string; name: string; entrances: { id: string; name: string }[] }[] }[];
  }[];
}

/**
 * Driftinformation och nyheter.
 *
 * Innan publicering visas hur många hyresgäster som berörs och hur inlägget ser
 * ut i appen, så att en felriktad publicering upptäcks innan den skickas.
 */
export function NoticesAdminPage() {
  const { t } = useI18n();
  const { can, me } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<'published' | 'scheduled' | 'draft' | 'archived'>('published');
  const state = useQuery<{ notices: NoticeRow[] }>(`/api/staff/notices?status=${tab}`);
  const structure = useQuery<Structure>('/api/staff/structure');
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header row-between">
        <div>
          <div className="eyebrow">Kommunikation</div>
          <h1>{t('staff.notices')}</h1>
        </div>
        {can('notice:write') ? (
          <Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setComposerOpen(true)}>
            Nytt inlägg
          </Button>
        ) : null}
      </header>

      <Tabs
        label="Status"
        active={tab}
        onChange={setTab}
        tabs={[
          { value: 'published', label: 'Publicerade' },
          { value: 'scheduled', label: 'Schemalagda' },
          { value: 'draft', label: 'Utkast' },
          { value: 'archived', label: 'Arkiv' },
        ]}
      />

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.notices.length === 0,
          render: <EmptyState icon={<MegaphoneIcon size={24} />} title="Inga inlägg" body="Skapa ett inlägg för att informera hyresgästerna." />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Rubrik</th>
                  <th className="hide-mobile">Typ</th>
                  <th className="hide-mobile">Mottagare</th>
                  <th className="hide-mobile">Publicering</th>
                  <th className="num">Läst</th>
                </tr>
              </thead>
              <tbody>
                {data.notices.map((notice) => (
                  <tr key={notice.id}>
                    <td>
                      <div className="strong">{notice.title}</div>
                      <div className="xs subtle clamp-2">{notice.summary}</div>
                      <div className="row" style={{ gap: 4, marginTop: 4 }}>
                        {notice.severity === 'critical' ? <Pill tone="critical">Kritisk</Pill> : null}
                        {notice.requires_acknowledgement ? <span className="tag">Kräver bekräftelse</span> : null}
                        {notice.pinned_until ? <span className="tag">Fäst</span> : null}
                      </div>
                    </td>
                    <td className="hide-mobile small">{KIND_LABEL[notice.kind] ?? notice.kind}</td>
                    <td className="hide-mobile small">
                      {notice.audience.map((entry) => scopeLabel(entry.scope)).join(', ')}
                    </td>
                    <td className="hide-mobile small subtle">
                      {notice.published_at
                        ? formatDateTime(notice.published_at)
                        : notice.publish_at
                          ? `Schemalagd ${formatDateTime(notice.publish_at)}`
                          : 'Utkast'}
                      {notice.unpublish_at ? (
                        <div className="xs">Avpubliceras {formatDateTime(notice.unpublish_at)}</div>
                      ) : null}
                    </td>
                    <td className="num">
                      {notice.read_count}
                      {notice.requires_acknowledgement ? ` / ${notice.acknowledged_count} bekr.` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>

      {composerOpen ? (
        <NoticeComposer
          structure={structure.data ?? { areas: [] }}
          orgName={me?.organisation.display_name ?? ''}
          canPublish={can('notice:publish')}
          onClose={() => setComposerOpen(false)}
          onSaved={(recipients) => {
            setComposerOpen(false);
            toast.show(`Inlägget är sparat. ${recipients} hyresgäster berörs.`);
            state.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function scopeLabel(scope: string): string {
  return (
    { organisation: 'Hela beståndet', area: 'Område', property: 'Fastighet', building: 'Byggnad', entrance: 'Trapphus', unit: 'Lägenhet', tenancy: 'Avtal' }[
      scope
    ] ?? scope
  );
}

interface ComposerProps {
  structure: Structure;
  orgName: string;
  canPublish: boolean;
  onClose: () => void;
  onSaved: (recipients: number) => void;
}

function NoticeComposer({ structure, orgName, canPublish, onClose, onSaved }: ComposerProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    kind: 'water_shutoff' as NoticeKind,
    severity: 'important' as 'critical' | 'important' | 'info',
    title: '',
    summary: '',
    body: '',
    startsAt: '',
    expectedEndAt: '',
    nextUpdateAt: '',
    publishAt: '',
    unpublishAt: '',
    pinnedUntil: '',
    contactInfo: '',
    requiresAcknowledgement: false,
    channels: ['inapp', 'push'] as string[],
  });
  const [audience, setAudience] = useState<{ scope: string; scopeId: string | null }[]>([]);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Antalet mottagare räknas om så snart urvalet ändras.
  useEffect(() => {
    if (audience.length === 0) {
      setRecipients(null);
      return;
    }
    let cancelled = false;
    api
      .post<{ residents: number }>('/api/staff/notices/preview-audience', { audience })
      .then((result) => !cancelled && setRecipients(result.residents))
      .catch(() => !cancelled && setRecipients(null));
    return () => {
      cancelled = true;
    };
  }, [audience]);

  const toggleAudience = (scope: string, scopeId: string | null) => {
    setAudience((current) => {
      const exists = current.some((entry) => entry.scope === scope && entry.scopeId === scopeId);
      return exists
        ? current.filter((entry) => !(entry.scope === scope && entry.scopeId === scopeId))
        : [...current, { scope, scopeId }];
    });
  };

  const isSelected = (scope: string, scopeId: string | null) =>
    audience.some((entry) => entry.scope === scope && entry.scopeId === scopeId);

  const save = async (schedule: boolean) => {
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ recipients: number }>('/api/staff/notices', {
        kind: form.kind,
        severity: form.severity,
        title: form.title,
        bodyHtml: form.body
          .split('\n\n')
          .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
          .join(''),
        summary: form.summary || undefined,
        audience,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        expectedEndAt: form.expectedEndAt ? new Date(form.expectedEndAt).toISOString() : undefined,
        nextUpdateAt: form.nextUpdateAt ? new Date(form.nextUpdateAt).toISOString() : undefined,
        publishAt: schedule && form.publishAt ? new Date(form.publishAt).toISOString() : undefined,
        unpublishAt: form.unpublishAt ? new Date(form.unpublishAt).toISOString() : undefined,
        pinnedUntil: form.pinnedUntil ? new Date(form.pinnedUntil).toISOString() : undefined,
        contactInfo: form.contactInfo || undefined,
        requiresAcknowledgement: form.requiresAcknowledgement,
        channels: form.channels,
      });
      onSaved(result.recipients);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError);
      toast.show(apiError.message, 'error', apiError.traceId);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      title="Nytt inlägg"
      onClose={onClose}
      footer={
        <>
          {form.publishAt ? (
            <Button variant="primary" block loading={pending} disabled={!form.title || !form.body || audience.length === 0} onClick={() => void save(true)}>
              {t('staff.schedulePublish')}
            </Button>
          ) : (
            <Button
              variant="primary"
              block
              loading={pending}
              disabled={!form.title || !form.body || audience.length === 0 || !canPublish}
              onClick={() => void save(false)}
            >
              Publicera nu
            </Button>
          )}
          <Button variant="ghost" block onClick={() => setPreview(!preview)}>
            {preview ? 'Dölj förhandsgranskning' : t('staff.preview')}
          </Button>
        </>
      }
    >
      <div className="stack stack-5">
        {error ? <Banner tone="critical" title={error.message} /> : null}
        {!canPublish ? (
          <Banner tone="info" title="Du kan skapa och schemalägga men inte publicera direkt." />
        ) : null}

        <Field label="Typ av inlägg">
          {({ id }) => (
            <select className="select" id={id} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as NoticeKind })}>
              {NOTICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind] ?? kind}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Prioritet">
          {({ id }) => (
            <select className="select" id={id} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value as 'critical' })}>
              <option value="info">Information</option>
              <option value="important">Viktigt</option>
              <option value="critical">Kritiskt (skickas alltid)</option>
            </select>
          )}
        </Field>

        <Field label="Rubrik" error={error?.fieldErrors.title}>
          {({ id }) => <Input id={id} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} />}
        </Field>

        <Field label="Kort sammanfattning" optional hint="Visas i listan och i notisen.">
          {({ id }) => <Input id={id} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} maxLength={400} />}
        </Field>

        <Field label="Text" error={error?.fieldErrors.bodyHtml}>
          {({ id }) => (
            <>
              <div className="editor-toolbar" role="toolbar" aria-label="Formatering">
                <span className="small muted" style={{ padding: '0 var(--space-2)' }}>
                  Skriv i klarspråk. Tom rad ger ett nytt stycke.
                </span>
              </div>
              <Textarea
                id={id}
                className="textarea editor-area"
                rows={8}
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </>
          )}
        </Field>

        <fieldset>
          <legend>{t('staff.recipients')}</legend>
          <div className="stack stack-2">
            <label className="checkbox" data-checked={isSelected('organisation', null)}>
              <input type="checkbox" checked={isSelected('organisation', null)} onChange={() => toggleAudience('organisation', null)} />
              <span className="choice-label">Alla hyresgäster</span>
            </label>
            {structure.areas.map((area) => (
              <details key={area.id} className="card card-quiet">
                <summary style={{ cursor: 'pointer' }}>
                  <label className="row" style={{ display: 'inline-flex' }}>
                    <input type="checkbox" checked={isSelected('area', area.id)} onChange={() => toggleAudience('area', area.id)} />
                    <span className="strong">{area.name}</span>
                  </label>
                </summary>
                <div className="stack stack-2" style={{ marginTop: 'var(--space-2)', paddingLeft: 'var(--space-4)' }}>
                  {area.properties.map((property) => (
                    <div key={property.id}>
                      <label className="row">
                        <input type="checkbox" checked={isSelected('property', property.id)} onChange={() => toggleAudience('property', property.id)} />
                        <span>{property.name}</span>
                      </label>
                      <div style={{ paddingLeft: 'var(--space-5)' }}>
                        {property.buildings.map((building) => (
                          <label className="row" key={building.id}>
                            <input type="checkbox" checked={isSelected('building', building.id)} onChange={() => toggleAudience('building', building.id)} />
                            <span className="small">{building.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
          {recipients !== null ? (
            <p className="small strong" style={{ marginTop: 'var(--space-3)' }}>
              {t('staff.estimatedRecipients', { count: recipients })}
            </p>
          ) : null}
        </fieldset>

        <div className="grid grid-2" style={{ gap: 'var(--space-3)' }}>
          <Field label="Starttid" optional>
            {({ id }) => <Input id={id} type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />}
          </Field>
          <Field label="Beräknad sluttid" optional>
            {({ id }) => (
              <Input id={id} type="datetime-local" value={form.expectedEndAt} onChange={(event) => setForm({ ...form, expectedEndAt: event.target.value })} />
            )}
          </Field>
          <Field label="Nästa uppdatering" optional>
            {({ id }) => (
              <Input id={id} type="datetime-local" value={form.nextUpdateAt} onChange={(event) => setForm({ ...form, nextUpdateAt: event.target.value })} />
            )}
          </Field>
          <Field label={t('staff.schedulePublish')} optional>
            {({ id }) => <Input id={id} type="datetime-local" value={form.publishAt} onChange={(event) => setForm({ ...form, publishAt: event.target.value })} />}
          </Field>
          <Field label={t('staff.unpublishAt')} optional>
            {({ id }) => <Input id={id} type="datetime-local" value={form.unpublishAt} onChange={(event) => setForm({ ...form, unpublishAt: event.target.value })} />}
          </Field>
          <Field label={t('staff.pinUntil')} optional>
            {({ id }) => <Input id={id} type="datetime-local" value={form.pinnedUntil} onChange={(event) => setForm({ ...form, pinnedUntil: event.target.value })} />}
          </Field>
        </div>

        <Field label={t('notice.contact')} optional>
          {({ id }) => <Input id={id} value={form.contactInfo} onChange={(event) => setForm({ ...form, contactInfo: event.target.value })} />}
        </Field>

        <fieldset>
          <legend>Kanaler</legend>
          <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
            {['inapp', 'push', 'email', 'sms'].map((channel) => (
              <button
                key={channel}
                type="button"
                className="chip"
                aria-pressed={form.channels.includes(channel)}
                onClick={() =>
                  setForm({
                    ...form,
                    channels: form.channels.includes(channel)
                      ? form.channels.filter((value) => value !== channel)
                      : [...form.channels, channel],
                  })
                }
              >
                {{ inapp: 'I appen', push: 'Push', email: 'E-post', sms: 'SMS' }[channel]}
              </button>
            ))}
          </div>
        </fieldset>

        <Checkbox
          checked={form.requiresAcknowledgement}
          onChange={(checked) => setForm({ ...form, requiresAcknowledgement: checked })}
          label="Kräv att mottagaren bekräftar informationen"
        />

        {preview ? (
          <div className="stack stack-3">
            <h3 className="section-title" style={{ margin: 0 }}>
              Så ser det ut i appen
            </h3>
            <div className="phone-preview stack stack-3">
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="brand-mark" aria-hidden="true">
                  {orgName.slice(0, 1)}
                </span>
                <strong>{orgName}</strong>
              </div>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                {form.severity === 'critical' ? <Pill tone="critical">Viktigt</Pill> : <Pill tone="info">Driftinfo</Pill>}
              </div>
              <h2 style={{ fontSize: 'var(--text-xl)' }}>{form.title || 'Rubrik'}</h2>
              <div className="card">
                {form.body.split('\n\n').map((paragraph, index) => (
                  <p key={index}>{paragraph || 'Text…'}</p>
                ))}
              </div>
              {form.contactInfo ? (
                <div className="banner banner-info">
                  <span className="small">{form.contactInfo}</span>
                </div>
              ) : null}
              {form.requiresAcknowledgement ? <Button variant="primary" block>Jag har läst informationen</Button> : null}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
