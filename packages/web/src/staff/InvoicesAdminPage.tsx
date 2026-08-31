import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatAmount, formatDate } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary, Tabs } from '../components/ui.js';
import { InvoiceIcon } from '../components/icons.js';

interface Invoice {
  id: string;
  invoice_number: string;
  ocr: string | null;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_ore: number;
  status: string;
  synced_at: string | null;
  object_number: string;
  property_name: string;
  first_name: string | null;
  last_name: string | null;
}

export function InvoicesAdminPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'all' | 'open' | 'overdue' | 'paid'>('all');
  const state = useQuery<{ invoices: Invoice[] }>(
    `/api/staff/invoices${status === 'all' ? '' : `?status=${status}`}`,
    [status],
  );

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Ekonomi</div>
        <h1>{t('invoice.title')}</h1>
        <p className="muted">
          Avierna kommer från ekonomisystemet. Plattformen tar inte emot betalningar.
        </p>
      </header>

      <Tabs
        label="Status"
        active={status}
        onChange={setStatus}
        tabs={[
          { value: 'all', label: 'Alla' },
          { value: 'open', label: 'Obetalda' },
          { value: 'overdue', label: 'Förfallna' },
          { value: 'paid', label: 'Betalda' },
        ]}
      />

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.invoices.length === 0,
          render: <EmptyState icon={<InvoiceIcon size={24} />} title="Inga avier" />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Avi</th>
                  <th className="hide-mobile">Objekt</th>
                  <th className="hide-mobile">Hyresgäst</th>
                  <th className="num">Belopp</th>
                  <th>Förfaller</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <div className="strong num">{invoice.invoice_number}</div>
                      <div className="xs subtle">
                        {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                      </div>
                    </td>
                    <td className="hide-mobile small">
                      {invoice.object_number}
                      <div className="xs subtle">{invoice.property_name}</div>
                    </td>
                    <td className="hide-mobile small">
                      {invoice.first_name ? `${invoice.first_name} ${invoice.last_name ?? ''}` : '–'}
                    </td>
                    <td className="num">{formatAmount(invoice.amount_ore)}</td>
                    <td className="small num">{formatDate(invoice.due_date)}</td>
                    <td>
                      <Pill
                        tone={
                          invoice.status === 'paid'
                            ? 'success'
                            : invoice.status === 'overdue'
                              ? 'critical'
                              : invoice.status === 'open'
                                ? 'warning'
                                : 'neutral'
                        }
                      >
                        {{ paid: 'Betald', open: 'Obetald', overdue: 'Förfallen', credited: 'Krediterad', cancelled: 'Makulerad' }[
                          invoice.status
                        ] ?? invoice.status}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
