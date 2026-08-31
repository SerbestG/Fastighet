import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useQuery } from '../lib/useQuery.js';
import { formatDateTime } from '../lib/format.js';
import { EmptyState, Input, Pill, QueryBoundary } from '../components/ui.js';
import { SearchIcon, ShieldIcon } from '../components/icons.js';

interface Entry {
  id: number;
  at: string;
  actor_email: string | null;
  actor_roles: string[] | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  outcome: string;
  ip: string | null;
  trace_id: string | null;
  detail: Record<string, unknown>;
}

/** Säkerhetsloggen är oföränderlig och visas här för uppföljning (krav C.4.1). */
export function AuditPage() {
  const { t } = useI18n();
  const [action, setAction] = useState('');
  const state = useQuery<{ entries: Entry[] }>(
    `/api/staff/audit-log?limit=200${action ? `&action=${encodeURIComponent(action)}` : ''}`,
    [action],
  );

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Administration</div>
        <h1>{t('staff.audit')}</h1>
        <p className="muted">
          Loggen kan bara läsas och kompletteras, aldrig ändras eller raderas från tjänsten.
        </p>
      </header>

      <div className="row">
        <SearchIcon size={18} />
        <Input
          aria-label="Filtrera på åtgärd"
          placeholder="Filtrera på åtgärd, t.ex. auth. eller case."
          value={action}
          onChange={(event) => setAction(event.target.value)}
        />
      </div>

      <QueryBoundary
        state={state}
        empty={{
          when: (data) => data.entries.length === 0,
          render: <EmptyState icon={<ShieldIcon size={24} />} title="Inga loggrader" body="Ändra filtret för att se fler." />,
        }}
      >
        {(data) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Tidpunkt</th>
                  <th>Åtgärd</th>
                  <th className="hide-mobile">Användare</th>
                  <th>Utfall</th>
                  <th className="hide-mobile">Objekt</th>
                  <th className="hide-mobile">Spårning</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="small nowrap">{formatDateTime(entry.at)}</td>
                    <td className="small strong">{entry.action}</td>
                    <td className="hide-mobile small">
                      {entry.actor_email ?? '–'}
                      {entry.actor_roles?.length ? <div className="xs subtle">{entry.actor_roles.join(', ')}</div> : null}
                    </td>
                    <td>
                      <Pill tone={entry.outcome === 'success' ? 'success' : entry.outcome === 'denied' ? 'warning' : 'critical'}>
                        {entry.outcome === 'success' ? 'Genomförd' : entry.outcome === 'denied' ? 'Nekad' : 'Fel'}
                      </Pill>
                    </td>
                    <td className="hide-mobile xs subtle">{entry.entity_type ?? '–'}</td>
                    <td className="hide-mobile xs trace">{entry.trace_id ?? '–'}</td>
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
