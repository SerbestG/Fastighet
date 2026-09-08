import { useState } from 'react';
import { useQuery } from '../lib/useQuery.js';
import { QueryBoundary } from '../components/ui.js';

/**
 * Användning av appen (krav A.3.12, A.3.13, A.3.14).
 *
 * Siffrorna är antal användare, inte antal klick, eftersom det är frågan kravet
 * ställer. Ingen enskild person går att följa: registreringen sker med en
 * pseudonym som byts varje dygn.
 */

interface Usage {
  days: number;
  activeCustomers: number;
  totalCustomers: number;
  byKey: { kind: string; key: string; users: number; days_used: number; last_used: string }[];
  byArea: { area: string; kind: string; key: string; users: number }[];
  overTime: { day: string; users: number }[];
}

const KIND_LABEL: Record<string, string> = {
  menu: 'Meny',
  view: 'Vy',
  notice: 'Nyhet',
};

export function UsagePanel() {
  const [days, setDays] = useState(30);
  const state = useQuery<Usage>(`/api/staff/analytics/usage?days=${days}`);

  return (
    <section className="stack stack-4">
      <header className="row row-between">
        <div>
          <h2 className="section-title">Användning</h2>
          <p className="small muted">
            Antal användare per del av appen. Registreringen sker med en pseudonym som byts varje
            dygn, så ingen enskild person går att följa.
          </p>
        </div>
        <select
          className="select"
          aria-label="Period"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
          style={{ maxWidth: '12rem' }}
        >
          <option value={7}>Senaste veckan</option>
          <option value={30}>Senaste 30 dagarna</option>
          <option value={90}>Senaste kvartalet</option>
        </select>
      </header>

      <QueryBoundary state={state} loadingRows={4}>
        {(data) => {
          const peak = Math.max(1, ...data.byKey.map((row) => row.users));
          const areas = [...new Set(data.byArea.map((row) => row.area))];

          return (
            <>
              <div className="grid grid-2">
                <div className="card stack stack-1">
                  <div className="section-title">Aktiva kunder</div>
                  <div className="row-between">
                    <span className="num strong" style={{ fontSize: '1.6rem' }}>
                      {data.activeCustomers}
                    </span>
                    <span className="small muted">av {data.totalCustomers} kundkonton</span>
                  </div>
                  <p className="xs subtle">Har loggat in under perioden.</p>
                </div>
                <div className="card stack stack-1">
                  <div className="section-title">Användare per dag</div>
                  <div className="row" style={{ gap: 2, alignItems: 'flex-end', height: '3rem' }}>
                    {data.overTime.map((point) => (
                      <span
                        key={point.day}
                        title={`${point.day}: ${point.users}`}
                        style={{
                          display: 'block',
                          flex: 1,
                          minWidth: 2,
                          height: `${Math.max(4, (point.users / Math.max(1, ...data.overTime.map((p) => p.users))) * 100)}%`,
                          background: 'var(--brand-primary)',
                          borderRadius: 2,
                        }}
                      />
                    ))}
                  </div>
                  <p className="xs subtle">Unika användare, fördelat över tid.</p>
                </div>
              </div>

              {data.byKey.length === 0 ? (
                <div className="card">
                  <p className="small muted">Ingen användning registrerad ännu för perioden.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Typ</th>
                        <th>Del av appen</th>
                        <th>Användare</th>
                        <th>Fördelning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byKey.map((row) => (
                        <tr key={`${row.kind}:${row.key}`}>
                          <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                          <td>{row.key}</td>
                          <td className="num">{row.users}</td>
                          <td style={{ width: '40%' }}>
                            <span className="bar-track">
                              <span className="bar-fill" style={{ width: `${(row.users / peak) * 100}%` }} />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {areas.length > 0 ? (
                <div className="stack stack-2">
                  <div className="section-title">Per område</div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Område</th>
                          <th>Del av appen</th>
                          <th>Användare</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byArea.slice(0, 25).map((row) => (
                          <tr key={`${row.area}:${row.kind}:${row.key}`}>
                            <td>{row.area}</td>
                            <td>{row.key}</td>
                            <td className="num">{row.users}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
