import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { openProtectedFile } from '../lib/api.js';
import { formatAmount, formatDate } from '../lib/format.js';
import { Banner, DefinitionList, EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { DownloadIcon, InvoiceIcon } from '../components/icons.js';

interface Invoice {
  id: string;
  invoice_number: string;
  ocr: string | null;
  bankgiro: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_ore: number;
  status: string;
  paid_at: string | null;
  file_id: string | null;
  is_overdue: boolean;
  object_number: string;
  property_street: string;
}

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'critical' | 'neutral' }> = {
  paid: { label: 'Betald', tone: 'success' },
  open: { label: 'Obetald', tone: 'warning' },
  overdue: { label: 'Förfallen', tone: 'critical' },
  credited: { label: 'Krediterad', tone: 'neutral' },
  cancelled: { label: 'Makulerad', tone: 'neutral' },
};

/**
 * Hyresavier.
 *
 * Betalningsuppgifterna visas i klartext med kopieringsbart OCR-nummer. Appen
 * påstår aldrig att betalning kan genomföras här när betalintegration saknas.
 */
export function InvoicesPage() {
  const { t } = useI18n();
  const state = useQuery<{
    invoices: Invoice[];
    payment: { inAppPaymentAvailable: boolean; reason: string | null };
  }>('/api/invoices');

  return (
    <div className="page stack stack-5">
      <header className="page-header">
        <h1>{t('invoice.title')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.invoices.length === 0,
          render: <EmptyState icon={<InvoiceIcon size={24} />} title={t('invoice.noneTitle')} body={t('invoice.noneBody')} />,
        }}
      >
        {(data) => (
          <>
            {!data.payment.inAppPaymentAvailable && data.payment.reason ? (
              <Banner tone="info" title="Så betalar du">
                <p className="small">{data.payment.reason}</p>
              </Banner>
            ) : null}

            <div className="stack stack-3">
              {data.invoices.map((invoice) => {
                const status = STATUS[invoice.is_overdue && invoice.status === 'open' ? 'overdue' : invoice.status] ?? {
                  label: invoice.status,
                  tone: 'neutral' as const,
                };
                return (
                  <article className="card stack stack-3" key={invoice.id}>
                    <div className="row-between row-start">
                      <div>
                        <div className="strong" style={{ fontSize: 'var(--text-lg)' }}>
                          {formatAmount(invoice.amount_ore)}
                        </div>
                        <div className="small muted">
                          {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                        </div>
                      </div>
                      <Pill tone={status.tone}>{status.label}</Pill>
                    </div>

                    <DefinitionList
                      items={[
                        { label: t('invoice.dueDate'), value: formatDate(invoice.due_date) },
                        { label: t('invoice.ocr'), value: <span className="num" style={{ userSelect: 'all' }}>{invoice.ocr ?? '–'}</span> },
                        { label: t('invoice.bankgiro'), value: <span className="num" style={{ userSelect: 'all' }}>{invoice.bankgiro ?? '–'}</span> },
                        { label: 'Objekt', value: invoice.object_number },
                      ]}
                    />

                    {invoice.file_id ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void openProtectedFile(invoice.file_id!, `${invoice.invoice_number}.pdf`)}
                      >
                        <DownloadIcon size={16} /> {t('common.download')}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
