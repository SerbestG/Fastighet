import { openProtectedFile } from '../lib/api.js';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatDate, fileSize } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { DocumentIcon, DownloadIcon } from '../components/icons.js';

interface Document {
  id: string;
  kind: string;
  title: string;
  document_date: string | null;
  requires_signature: boolean;
  signed_at: string | null;
  file_id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

const KIND_LABEL: Record<string, string> = {
  lease: 'Hyresavtal',
  invoice: 'Faktura',
  inspection_protocol: 'Besiktningsprotokoll',
  house_rules: 'Ordningsregler',
  consent: 'Medgivande',
  permit: 'Tillstånd',
  floor_plan: 'Planlösning',
  signature_request: 'För signering',
  other: 'Övrigt',
};

export function DocumentsPage() {
  const { t } = useI18n();
  const state = useQuery<{
    documents: Document[];
    floorPlans: { file_id: string; original_name: string; size_bytes: number; object_number: string }[];
  }>('/api/documents');

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('document.title')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.documents.length === 0 && data.floorPlans.length === 0,
          render: <EmptyState icon={<DocumentIcon size={24} />} title={t('document.noneTitle')} body={t('document.noneBody')} />,
        }}
      >
        {(data) => (
          <div className="card card-flush">
            {data.documents.map((document) => (
              <button
                type="button"
                className="list-item"
                key={document.id}
                onClick={() => void openProtectedFile(document.file_id, document.original_name)}
              >
                <span className="grow stack stack-1">
                  <span className="list-title">{document.title}</span>
                  <span className="list-meta">
                    {KIND_LABEL[document.kind] ?? document.kind}
                    {document.document_date ? ` · ${formatDate(document.document_date)}` : ''} · {fileSize(document.size_bytes)}
                  </span>
                  {document.requires_signature && !document.signed_at ? (
                    <span style={{ marginTop: 4 }}>
                      <Pill tone="warning">{t('document.signature')}</Pill>
                    </span>
                  ) : null}
                </span>
                <DownloadIcon size={18} className="chevron" />
              </button>
            ))}
            {data.floorPlans.map((plan) => (
              <button
                type="button"
                className="list-item"
                key={plan.file_id}
                onClick={() => void openProtectedFile(plan.file_id, plan.original_name)}
              >
                <span className="grow stack stack-1">
                  <span className="list-title">Planlösning</span>
                  <span className="list-meta">
                    {plan.object_number} · {fileSize(plan.size_bytes)}
                  </span>
                </span>
                <DownloadIcon size={18} className="chevron" />
              </button>
            ))}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
