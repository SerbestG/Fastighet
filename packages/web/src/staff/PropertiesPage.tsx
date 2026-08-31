import { useState } from 'react';
import { useQuery } from '../lib/useQuery.js';
import { useI18n } from '../lib/i18n.js';
import { EmptyState, Input, QueryBoundary } from '../components/ui.js';
import { BuildingIcon, SearchIcon } from '../components/icons.js';

interface Structure {
  areas: {
    id: string;
    name: string;
    code: string | null;
    properties: {
      id: string;
      name: string;
      street: string;
      city: string;
      designation: string | null;
      buildings: { id: string; name: string; hasElevator: boolean; entrances: { id: string; name: string; street: string; unitCount: number }[] }[];
    }[];
  }[];
}

interface UnitRow {
  unit_id: string;
  object_number: string;
  unit_label: string;
  unit_kind: string;
  entrance_name: string;
  building_name: string;
  property_name: string;
  property_street: string;
  area_name: string;
  floor: number | null;
  rooms: number | null;
  area_sqm: number | null;
  tenancy_id: string | null;
  tenancy_status: string | null;
  starts_at: string | null;
  earliest_move_out: string | null;
  residents: { userId: string; firstName: string; lastName: string; role: string; isPrimary: boolean; phone: string | null; email: string }[];
}

/** Sök och filtrera i hela fastighetsstrukturen (krav B.1.8, B.1.9). */
export function PropertiesPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const structure = useQuery<Structure>('/api/staff/structure');
  const units = useQuery<{ units: UnitRow[] }>(
    `/api/staff/units?limit=200${search ? `&q=${encodeURIComponent(search)}` : ''}${propertyId ? `&propertyId=${propertyId}` : ''}`,
    [search, propertyId],
  );

  return (
    <div className="page-wide stack stack-5">
      <header className="page-header">
        <div className="eyebrow">Bestånd</div>
        <h1>{t('staff.properties')}</h1>
      </header>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 18rem) 1fr', alignItems: 'start' }}>
        <aside className="card stack stack-3">
          <h2 className="section-title" style={{ margin: 0 }}>
            Struktur
          </h2>
          <QueryBoundary state={structure} loadingRows={2}>
            {(data) => (
              <div className="stack stack-2">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={propertyId === ''}
                  onClick={() => setPropertyId('')}
                  style={{ justifyContent: 'flex-start' }}
                >
                  Hela beståndet
                </button>
                {data.areas.map((area) => (
                  <details key={area.id} open>
                    <summary className="strong" style={{ cursor: 'pointer' }}>
                      {area.name}
                      {area.code ? <span className="subtle small"> · {area.code}</span> : null}
                    </summary>
                    <div className="stack stack-1" style={{ paddingLeft: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                      {area.properties.map((property) => (
                        <button
                          key={property.id}
                          type="button"
                          className="chip"
                          aria-pressed={propertyId === property.id}
                          onClick={() => setPropertyId(property.id)}
                          style={{ justifyContent: 'flex-start' }}
                        >
                          {property.name}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </QueryBoundary>
        </aside>

        <div className="stack stack-4">
          <div className="row">
            <SearchIcon size={18} />
            <Input
              aria-label="Sök hyresobjekt"
              placeholder="Sök objektnummer, adress eller lägenhet"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <QueryBoundary
            state={units}
            empty={{
              when: (data) => data.units.length === 0,
              render: <EmptyState icon={<BuildingIcon size={24} />} title="Inga hyresobjekt" body="Ändra sökning eller filter." />,
            }}
          >
            {(data) => (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Objekt</th>
                      <th className="hide-mobile">Adress</th>
                      <th className="hide-mobile">Storlek</th>
                      <th>Hyresgäst</th>
                      <th className="hide-mobile">Medboende</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.units.map((unit) => {
                      const primary = unit.residents.find((resident) => resident.isPrimary);
                      const others = unit.residents.filter((resident) => !resident.isPrimary);
                      return (
                        <tr key={unit.unit_id}>
                          <td>
                            <div className="strong">{unit.object_number}</div>
                            <div className="xs subtle">
                              Lgh {unit.unit_label} · {unit.entrance_name}
                            </div>
                          </td>
                          <td className="hide-mobile small">
                            {unit.property_street}
                            <div className="xs subtle">
                              {unit.building_name} · {unit.area_name}
                            </div>
                          </td>
                          <td className="hide-mobile small num">
                            {unit.rooms ? `${unit.rooms} rok` : '–'}
                            {unit.area_sqm ? ` · ${unit.area_sqm} m²` : ''}
                            {unit.floor !== null ? ` · plan ${unit.floor}` : ''}
                          </td>
                          <td className="small">
                            {primary ? (
                              <>
                                <div className="strong">
                                  {primary.firstName} {primary.lastName}
                                </div>
                                <div className="xs subtle">{primary.phone ?? primary.email}</div>
                              </>
                            ) : (
                              <span className="subtle">Vakant</span>
                            )}
                          </td>
                          <td className="hide-mobile small">
                            {others.length ? others.map((r) => `${r.firstName} ${r.lastName}`).join(', ') : <span className="subtle">–</span>}
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
      </div>
    </div>
  );
}
