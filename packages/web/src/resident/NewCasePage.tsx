import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CASE_CATEGORIES,
  COMMON_AREA_SPACES,
  RESIDENCE_SPACES,
  derivePriority,
  findSubcategory,
  type CaseCategory,
  type CaseLocationKind,
  type CaseSubcategory,
  type TriageQuestion,
} from '@hemvist/shared';
import { ApiError, api, uploadFiles } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { useToast } from '../lib/toast.js';
import { fileSize } from '../lib/format.js';
import {
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  RadioGroup,
  Textarea,
} from '../components/ui.js';
import { AlertIcon, CameraIcon, CheckIcon, ChevronLeft, CloseIcon, PhoneIcon } from '../components/icons.js';

interface Taxonomy {
  locations: {
    tenancy_id: string;
    unit_id: string;
    object_number: string;
    unit_label: string;
    unit_kind: string;
    property_name: string;
    building_name: string;
    building_id: string;
  }[];
}

interface Attachment {
  id: string;
  originalName: string;
  sizeBytes: number;
  previewUrl?: string;
}

const STEPS = ['Var', 'Vad', 'Beskriv', 'Bilder', 'Tillträde', 'Skicka'] as const;

const WEEKDAYS = [
  { value: 1, label: 'Mån' },
  { value: 2, label: 'Tis' },
  { value: 3, label: 'Ons' },
  { value: 4, label: 'Tors' },
  { value: 5, label: 'Fre' },
];

/**
 * Felanmälan i sex steg.
 *
 * Varje steg ställer en fråga i taget så att formuläret går att fylla i med en
 * hand på mobilen. Följdfrågorna kommer från kategorin och avgör prioriteten –
 * svarar hyresgästen att läckan pågår och inte går att stänga av, styrs ärendet
 * till jouren redan innan det skickas.
 */
export function NewCasePage() {
  const { t } = useI18n();
  const { me, term } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const taxonomy = useQuery<Taxonomy>('/api/case-taxonomy');

  const [step, setStep] = useState(0);
  const [locationKind, setLocationKind] = useState<CaseLocationKind | null>(null);
  const [tenancyId, setTenancyId] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const [subcategory, setSubcategory] = useState<CaseSubcategory | null>(null);
  const [space, setSpace] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allowMasterKey, setAllowMasterKey] = useState(false);
  const [hasPets, setHasPets] = useState(false);
  const [petNotes, setPetNotes] = useState('');
  const [contactPhone, setContactPhone] = useState(me?.user.phone ?? '');
  const [windows, setWindows] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const locations = taxonomy.data?.locations ?? [];
  const residence = locations.find((location) => location.unit_kind === 'apartment') ?? locations[0];
  const otherObjects = locations.filter((location) => location.unit_kind !== 'apartment');

  const availableCategories = useMemo(
    () => (locationKind ? CASE_CATEGORIES.filter((c) => c.locationKinds.includes(locationKind)) : []),
    [locationKind],
  );

  const spaces = locationKind === 'common_area' ? COMMON_AREA_SPACES : RESIDENCE_SPACES;

  const triage = subcategory?.triage ?? [];
  const visibleTriage = triage.filter(
    (question) => !question.showWhen || answers[question.showWhen.questionId] === question.showWhen.equals,
  );

  const assessment =
    category && subcategory ? derivePriority(category.key, subcategory.key, answers) : null;
  const isEmergency = assessment?.escalated ?? false;

  const missingRequired = visibleTriage.filter((question) => question.required && !answers[question.id]);
  const canContinue = (() => {
    switch (step) {
      case 0:
        return locationKind !== null && (locationKind === 'common_area' ? buildingId !== null : tenancyId !== null);
      case 1:
        return category !== null && subcategory !== null;
      case 2:
        return description.trim().length >= 3 && missingRequired.length === 0;
      default:
        return true;
    }
  })();

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadFiles([...fileList].slice(0, 10 - attachments.length));
      setAttachments((current) => [
        ...current,
        ...uploaded.map((file, index) => ({
          ...file,
          previewUrl: fileList[index] ? URL.createObjectURL(fileList[index]!) : undefined,
        })),
      ]);
    } catch (caught) {
      const apiError = caught as ApiError;
      toast.show(apiError.message, 'error', apiError.traceId);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!category || !subcategory || !locationKind) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ case: { id: string; caseNumber: string }; emergency: { guidance: string; phone: string | null } | null }>(
        '/api/cases',
        {
          locationKind,
          tenancyId: locationKind === 'common_area' ? undefined : tenancyId,
          buildingId: locationKind === 'common_area' ? buildingId : undefined,
          categoryKey: category.key,
          subcategoryKey: subcategory.key,
          space: space ?? undefined,
          description,
          triageAnswers: answers,
          allowMasterKeyAccess: allowMasterKey,
          hasPets,
          petNotes: hasPets ? petNotes || undefined : undefined,
          contactPhone: contactPhone || undefined,
          accessWindows: windows.map((weekday) => ({ weekday, from: '08:00', to: '16:00' })),
          attachmentIds: attachments.map((file) => file.id),
        },
      );
      toast.show(t('case.submitted'));
      navigate(`/arenden/${result.case.id}`, { replace: true });
    } catch (caught) {
      setError(caught as ApiError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page stack stack-5">
      <div className="row">
        <button
          type="button"
          className="icon-btn"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
          aria-label={t('common.back')}
        >
          <ChevronLeft />
        </button>
        <div className="grow">
          <div className="small muted">
            Steg {step + 1} av {STEPS.length} · {STEPS[step]}
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{term('case', t('case.new'))}</h1>
        </div>
      </div>

      <div className="wizard-progress" role="presentation">
        {STEPS.map((label, index) => (
          <span key={label} data-done={index <= step} />
        ))}
      </div>

      {isEmergency && subcategory?.emergencyGuidance ? (
        <Banner tone="critical" title={t('case.emergencyTitle')}>
          <p>{subcategory.emergencyGuidance.sv}</p>
          {me?.organisation.emergency_phone ? (
            <a className="btn btn-danger btn-sm" href={`tel:${me.organisation.emergency_phone}`}>
              <PhoneIcon size={16} /> Ring jouren {me.organisation.emergency_phone}
            </a>
          ) : null}
        </Banner>
      ) : null}

      {error ? (
        <Banner tone="critical" title={error.message}>
          {error.traceId ? <span className="trace">ID: {error.traceId}</span> : null}
        </Banner>
      ) : null}

      {/* -------------------------------------------------- steg 1: var --- */}
      {step === 0 ? (
        <div className="stack stack-4">
          <RadioGroup
            name="location"
            legend={t('case.location')}
            value={locationKind}
            onChange={(value) => {
              setLocationKind(value);
              setCategory(null);
              setSubcategory(null);
              setSpace(null);
              if (value === 'residence' && residence) setTenancyId(residence.tenancy_id);
              if (value === 'common_area' && residence) setBuildingId(residence.building_id);
            }}
            options={[
              { value: 'residence', label: 'I bostaden', description: residence ? `${residence.property_name}, lägenhet ${residence.unit_label}` : undefined },
              ...(otherObjects.length
                ? [{ value: 'contract_object' as const, label: 'Annat objekt i mitt avtal', description: otherObjects.map((o) => o.object_number).join(', ') }]
                : []),
              { value: 'common_area', label: 'Gemensamt utrymme', description: 'Trapphus, tvättstuga, gård eller garage' },
            ]}
          />

          {locationKind === 'contract_object' && otherObjects.length ? (
            <Field label="Vilket objekt gäller det?">
              {({ id }) => (
                <select className="select" id={id} value={tenancyId ?? ''} onChange={(event) => setTenancyId(event.target.value)}>
                  <option value="">Välj objekt</option>
                  {otherObjects.map((object) => (
                    <option key={object.tenancy_id} value={object.tenancy_id}>
                      {object.object_number} – {object.unit_label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------- steg 2: vad --- */}
      {step === 1 ? (
        <div className="stack stack-4">
          {!category ? (
            <>
              <h2 className="section-title">{t('case.category')}</h2>
              <div className="choice-grid">
                {availableCategories.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="choice-card"
                    aria-pressed={false}
                    onClick={() => setCategory(item)}
                  >
                    <span className="title">{item.label.sv}</span>
                    <span className="hint">{item.hint.sv}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="row-between">
                <h2 className="section-title" style={{ margin: 0 }}>
                  {category.label.sv}
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCategory(null);
                    setSubcategory(null);
                    setAnswers({});
                  }}
                >
                  Byt kategori
                </Button>
              </div>
              <div className="stack stack-2">
                {category.subcategories.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="choice-card"
                    aria-pressed={subcategory?.key === item.key}
                    onClick={() => {
                      setSubcategory(item);
                      setAnswers({});
                    }}
                  >
                    <span className="title">{item.label.sv}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* --------------------------------------------- steg 3: beskriv --- */}
      {step === 2 ? (
        <div className="stack stack-5">
          {locationKind !== 'contract_object' ? (
            <Field label={t('case.space')} optional>
              {({ id }) => (
                <select className="select" id={id} value={space ?? ''} onChange={(event) => setSpace(event.target.value || null)}>
                  <option value="">Välj utrymme</option>
                  {spaces.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label.sv}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}

          {visibleTriage.map((question) => (
            <TriageField
              key={question.id}
              question={question}
              value={answers[question.id] ?? ''}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          ))}

          <Field
            label={t('case.describe')}
            hint={t('case.descriptionHelp')}
            error={error?.fieldErrors.description}
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={4000}
                placeholder="Vad har hänt, var i bostaden och sedan när?"
              />
            )}
          </Field>
        </div>
      ) : null}

      {/* ---------------------------------------------- steg 4: bilder --- */}
      {step === 3 ? (
        <div className="stack stack-4">
          <div>
            <h2 className="section-title">{t('case.attachments')}</h2>
            <p className="small muted">{t('case.attachmentsHelp')}</p>
          </div>
          <div className="attachment-grid">
            {attachments.map((file) => (
              <div className="attachment" key={file.id}>
                {file.previewUrl ? (
                  <img src={file.previewUrl} alt={file.originalName} />
                ) : (
                  <span className="xs muted center">{fileSize(file.sizeBytes)}</span>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}
                  aria-label={`Ta bort ${file.originalName}`}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            ))}
            {attachments.length < 10 ? (
              <label className="upload-tile">
                <CameraIcon size={22} />
                {uploading ? 'Laddar upp…' : 'Lägg till'}
                <input
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,application/pdf"
                  multiple
                  className="visually-hidden"
                  onChange={(event) => void addFiles(event.target.files)}
                />
              </label>
            ) : null}
          </div>
          {attachments.length === 0 ? (
            <p className="small muted">
              En bild gör det ofta enklare för bovärden att ta med rätt verktyg direkt.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------ steg 5: tillträde --- */}
      {step === 4 ? (
        <div className="stack stack-5">
          <fieldset>
            <legend>{t('case.accessTitle')}</legend>
            <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className="chip"
                  aria-pressed={windows.includes(day.value)}
                  onClick={() =>
                    setWindows((current) =>
                      current.includes(day.value)
                        ? current.filter((value) => value !== day.value)
                        : [...current, day.value],
                    )
                  }
                >
                  {day.label}
                </button>
              ))}
            </div>
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
              Vardagar 08.00–16.00. Väljer du inget kommer vi överens om en tid senare.
            </p>
          </fieldset>

          <Checkbox
            checked={allowMasterKey}
            onChange={setAllowMasterKey}
            label={t('case.masterKey')}
            description={t('case.masterKeyHelp')}
          />

          {locationKind !== 'common_area' ? (
            <>
              <Checkbox checked={hasPets} onChange={setHasPets} label={t('case.pets')} />
              {hasPets ? (
                <Field label={t('case.petNotes')} optional>
                  {({ id }) => <Input id={id} value={petNotes} onChange={(event) => setPetNotes(event.target.value)} maxLength={280} />}
                </Field>
              ) : null}
            </>
          ) : null}

          <Field label={t('case.contactPhone')} optional>
            {({ id }) => (
              <Input id={id} type="tel" autoComplete="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
            )}
          </Field>
        </div>
      ) : null}

      {/* ---------------------------------------------- steg 6: skicka --- */}
      {step === 5 ? (
        <div className="stack stack-4">
          <div className="card stack stack-3">
            <Row label="Var" value={locationKind === 'common_area' ? 'Gemensamt utrymme' : residence ? `${residence.property_name}, lägenhet ${residence.unit_label}` : '–'} />
            <Row label="Kategori" value={`${category?.label.sv ?? ''} · ${subcategory?.label.sv ?? ''}`} />
            {space ? <Row label="Utrymme" value={spaces.find((item) => item.key === space)?.label.sv ?? space} /> : null}
            <Row label="Prioritet" value={priorityLabel(assessment?.priority ?? 'normal')} />
            <Row label="Bilagor" value={attachments.length ? `${attachments.length} st` : 'Inga'} />
            <Row label="Huvudnyckel" value={allowMasterKey ? 'Godkänd' : 'Ej godkänd'} />
          </div>
          <div className="card">
            <div className="small muted" style={{ marginBottom: 'var(--space-2)' }}>
              Din beskrivning
            </div>
            <p>{description}</p>
          </div>
        </div>
      ) : null}

      <div className="stack stack-2" style={{ marginTop: 'var(--space-4)' }}>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" size="lg" block disabled={!canContinue} onClick={() => setStep(step + 1)}>
            {t('common.next')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block loading={submitting} onClick={() => void submit()} icon={<CheckIcon size={18} />}>
            {t('case.submit')}
          </Button>
        )}
        {step === 2 && missingRequired.length ? (
          <p className="small" style={{ color: 'var(--status-critical)' }}>
            <AlertIcon size={14} /> Besvara följdfrågorna innan du går vidare.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-between">
      <span className="muted small">{label}</span>
      <span className="strong" style={{ textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function priorityLabel(priority: string): string {
  return { emergency: 'Akut', high: 'Hög', normal: 'Normal', low: 'Låg' }[priority] ?? priority;
}

function TriageField({
  question,
  value,
  onChange,
}: {
  question: TriageQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  if (question.type === 'text') {
    return (
      <Field label={question.label.sv} hint={question.help?.sv} optional={!question.required}>
        {({ id, describedBy }) => (
          <Input id={id} aria-describedby={describedBy} value={value} onChange={(event) => onChange(event.target.value)} maxLength={2000} />
        )}
      </Field>
    );
  }

  const options = question.options ?? [];
  return (
    <fieldset>
      <legend>
        {question.label.sv}
        {!question.required ? <span className="optional"> (frivilligt)</span> : null}
      </legend>
      <div className="row row-wrap" style={{ gap: 'var(--space-2)' }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="chip"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label.sv}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export { findSubcategory };
