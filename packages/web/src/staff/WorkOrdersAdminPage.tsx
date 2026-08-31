import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatAmount, formatDateTime, relativeTime } from '../lib/format.js';
import { EmptyState, Pill, QueryBoundary } from '../components/ui.js';
import { ToolboxIcon } from '../components/icons.js';

interface WorkOrder {
  id: string;
  number: string;
  title: string;
  status: string;
  planned_start: string | null;
  accepted_at: string | null;
  declined_reason: string | null;
  checked_in_at: string | null;
  completed_at: string | null;
  blocker_reason: string | null;
  minutes_spent: number | null;
  created_at: string;
  case_number: string;
  case_title: string;
  priority: string;
  contractor_name: string | null;
  object_number: string | null;
  property_street: string | null;
  material_cost_ore: number;
}

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'critical' | 'info' | 'neutral' }> = {
  offered: { label: 'Erbjuden', tone: 'info' },
  accepted: { label: 'Accepterad', tone: 'info' },
  declined: { label: 'Avböjd', tone: 'critical' },
  scheduled: { label: 'Planerad', tone: 'info' },
  on_site: { label: 'På plats', tone: 'warning' },
  blocked: { label: 'Hinder', tone: 'critical' },
  completed: { label: 'Klar', tone: 'success' },
  cancelled: { label: 'Avbruten', tone: 'neutral' },
};

export function WorkOrdersAdminPage() {
  const { t } = useI18n();
  const state = useQuery<{ workOrders: WorkOrder[] }>('/api/staff/work-orders');

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Utförande</div>
        <h1>{t('contractor.workOrders')}</h1>
      </header>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.workOrders.length === 0,
          render: <EmptyState icon={<ToolboxIcon size={24} />} title="Inga arbetsorder" body="Skapa en arbetsorder från ett ärende." />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Arbetsorder</th>
                  <th className="hide-mobile">Ärende</th>
                  <th className="hide-mobile">Utförare</th>
                  <th>Status</th>
                  <th className="hide-mobile num">Tid</th>
                  <th className="hide-mobile num">Material</th>
                </tr>
              </thead>
              <tbody>
                {data.workOrders.map((order) => {
                  const status = STATUS[order.status] ?? { label: order.status, tone: 'neutral' as const };
                  return (
                    <tr key={order.id}>
                      <td>
                        <div className="strong">{order.title}</div>
                        <div className="xs subtle">
                          {order.number} · {order.object_number ?? order.property_street}
                        </div>
                      </td>
                      <td className="hide-mobile small">
                        {order.case_number}
                        <div className="xs subtle clamp-2">{order.case_title}</div>
                      </td>
                      <td className="hide-mobile small">{order.contractor_name ?? 'Egen personal'}</td>
                      <td>
                        <Pill tone={status.tone}>{status.label}</Pill>
                        {order.blocker_reason ? <div className="xs" style={{ color: 'var(--status-critical)' }}>{order.blocker_reason}</div> : null}
                        {order.declined_reason ? <div className="xs subtle">{order.declined_reason}</div> : null}
                        <div className="xs subtle">
                          {order.completed_at
                            ? `Klar ${formatDateTime(order.completed_at)}`
                            : order.checked_in_at
                              ? `På plats ${relativeTime(order.checked_in_at)}`
                              : order.accepted_at
                                ? `Accepterad ${relativeTime(order.accepted_at)}`
                                : `Skapad ${relativeTime(order.created_at)}`}
                        </div>
                      </td>
                      <td className="hide-mobile num small">
                        {order.minutes_spent ? `${Math.round((order.minutes_spent / 60) * 10) / 10} tim` : '–'}
                      </td>
                      <td className="hide-mobile num small">
                        {order.material_cost_ore ? formatAmount(order.material_cost_ore) : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
