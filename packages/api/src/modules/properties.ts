import type { FastifyInstance } from 'fastify';
import {
  createAreaSchema,
  createBuildingSchema,
  createEntranceSchema,
  createPropertySchema,
  createTenancySchema,
  createUnitSchema,
  inviteResidentSchema,
} from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requirePermission, scopeCondition } from '../core/context.js';
import { conflict, notFound } from '../core/errors.js';
import { generateInvitationCode, hashToken } from '../core/crypto.js';
import { parse } from '../core/validate.js';
import { ensureMoveFlow } from './moving.js';
import { sequence } from '../core/sequence.js';

/**
 * Fastighetsstruktur, hyresobjekt och hyresförhållanden.
 *
 * Sökning och filtrering sker på hela strukturen (krav B.1.8, B.1.9), och
 * handläggarens egen avgränsning begränsar alltid vad som visas.
 */
export async function registerPropertyRoutes(app: FastifyInstance): Promise<void> {
  /** Hela strukturen som ett träd, för filter och navigering. */
  app.get('/api/staff/structure', async (request) => {
    const auth = requirePermission(request, 'property:read');
    return db(request, async (client) => {
      const params: unknown[] = [];
      const scope = scopeCondition(auth.scopes, { areaId: 'a.id', propertyId: 'p.id' }, params);
      const result = await client.query(
        `select a.id as area_id, a.name as area_name, a.code as area_code,
                p.id as property_id, p.name as property_name, p.street as property_street,
                p.city, p.latitude, p.longitude, p.designation,
                b.id as building_id, b.name as building_name, b.has_elevator,
                e.id as entrance_id, e.name as entrance_name, e.street as entrance_street,
                (select count(*)::int from units u where u.entrance_id = e.id) as unit_count
           from areas a
           left join properties p on p.area_id = a.id
           left join buildings b on b.property_id = p.id
           left join entrances e on e.building_id = b.id
          where ${scope}
          order by a.name, p.name, b.name, e.name`,
        params,
      );

      const areas = new Map<string, Record<string, unknown>>();
      for (const row of result.rows) {
        let area = areas.get(row.area_id);
        if (!area) {
          area = { id: row.area_id, name: row.area_name, code: row.area_code, properties: [] };
          areas.set(row.area_id, area);
        }
        if (!row.property_id) continue;
        const properties = area.properties as Record<string, unknown>[];
        let property = properties.find((p) => p.id === row.property_id);
        if (!property) {
          property = {
            id: row.property_id,
            name: row.property_name,
            street: row.property_street,
            city: row.city,
            designation: row.designation,
            latitude: row.latitude,
            longitude: row.longitude,
            buildings: [],
          };
          properties.push(property);
        }
        if (!row.building_id) continue;
        const buildings = property.buildings as Record<string, unknown>[];
        let building = buildings.find((b) => b.id === row.building_id);
        if (!building) {
          building = {
            id: row.building_id,
            name: row.building_name,
            hasElevator: row.has_elevator,
            entrances: [],
          };
          buildings.push(building);
        }
        if (!row.entrance_id) continue;
        (building.entrances as Record<string, unknown>[]).push({
          id: row.entrance_id,
          name: row.entrance_name,
          street: row.entrance_street,
          unitCount: row.unit_count,
        });
      }
      return { areas: [...areas.values()] };
    });
  });

  app.get<{ Querystring: { q?: string; propertyId?: string; buildingId?: string; limit?: string } }>(
    '/api/staff/units',
    async (request) => {
      const auth = requirePermission(request, 'property:read');
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = [
          scopeCondition(auth.scopes, { areaId: 'uh.area_id', propertyId: 'uh.property_id' }, params),
        ];
        if (request.query.q) {
          params.push(`%${request.query.q}%`);
          const i = params.length;
          where.push(
            `(uh.object_number ilike $${i} or uh.property_street ilike $${i} or uh.property_name ilike $${i} or uh.unit_label ilike $${i})`,
          );
        }
        if (request.query.propertyId) {
          params.push(request.query.propertyId);
          where.push(`uh.property_id = $${params.length}`);
        }
        if (request.query.buildingId) {
          params.push(request.query.buildingId);
          where.push(`uh.building_id = $${params.length}`);
        }
        params.push(Math.min(Number(request.query.limit ?? 100) || 100, 300));

        const result = await client.query(
          `select uh.unit_id, uh.object_number, uh.unit_label, uh.unit_kind, uh.entrance_name,
                  uh.building_name, uh.property_name, uh.property_street, uh.area_name,
                  u.floor, u.rooms, u.area_sqm,
                  t.id as tenancy_id, t.starts_at, t.ends_at, t.earliest_move_out, t.status as tenancy_status,
                  coalesce(json_agg(json_build_object(
                    'userId', ru.id, 'firstName', ru.first_name, 'lastName', ru.last_name,
                    'role', tr.role, 'isPrimary', tr.is_primary, 'phone', ru.phone, 'email', ru.email
                  )) filter (where ru.id is not null), '[]'::json) as residents
             from unit_hierarchy uh
             join units u on u.id = uh.unit_id
             left join tenancies t on t.unit_id = uh.unit_id and t.status in ('upcoming','active','notice_given')
             left join tenancy_residents tr on tr.tenancy_id = t.id and tr.moved_out_at is null
             left join users ru on ru.id = tr.user_id
            where ${where.join(' and ')}
            group by uh.unit_id, uh.object_number, uh.unit_label, uh.unit_kind, uh.entrance_name,
                     uh.building_name, uh.property_name, uh.property_street, uh.area_name,
                     u.floor, u.rooms, u.area_sqm, t.id
            order by uh.property_name, uh.object_number
            limit $${params.length}`,
          params,
        );
        return { units: result.rows };
      });
    },
  );

  app.get<{ Params: { id: string } }>('/api/staff/units/:id', async (request) => {
    requirePermission(request, 'property:read');
    return db(request, async (client) => {
      const unit = await client.query(
        `select uh.*, u.floor, u.rooms, u.area_sqm, u.floor_plan_file_id
           from unit_hierarchy uh join units u on u.id = uh.unit_id where uh.unit_id = $1`,
        [request.params.id],
      );
      if (!unit.rowCount) throw notFound('Hyresobjektet hittades inte.');

      const [tenancies, features, cases, documents] = await sequence([

        () => client.query(
          `select t.id, t.starts_at, t.ends_at, t.earliest_move_out, t.status, t.monthly_rent_ore,
                  t.external_ref,
                  coalesce(json_agg(json_build_object(
                    'userId', u.id, 'firstName', u.first_name, 'lastName', u.last_name,
                    'email', u.email, 'phone', u.phone, 'role', tr.role, 'isPrimary', tr.is_primary
                  )) filter (where u.id is not null), '[]'::json) as residents
             from tenancies t
             left join tenancy_residents tr on tr.tenancy_id = t.id and tr.moved_out_at is null
             left join users u on u.id = tr.user_id
            where t.unit_id = $1 group by t.id order by t.starts_at desc`,
          [request.params.id],
        ),

        () => client.query('select category, label, value from unit_features where unit_id = $1 order by category, sort_order', [request.params.id]),

        () => client.query(
          `select id, case_number, title, status, priority, created_at from cases
            where unit_id = $1 order by created_at desc limit 20`,
          [request.params.id],
        ),

        () => client.query(
          `select d.id, d.kind, d.title, d.document_date, f.original_name
             from documents d join files f on f.id = d.file_id
            where d.unit_id = $1 or d.tenancy_id in (select id from tenancies where unit_id = $1)
            order by d.created_at desc limit 50`,
          [request.params.id],
        ),
      ]);

      return {
        unit: unit.rows[0],
        tenancies: tenancies.rows,
        features: features.rows,
        cases: cases.rows,
        documents: documents.rows,
      };
    });
  });

  /* ------------------------------------------------ struktur skrivs --- */

  app.post('/api/staff/areas', async (request) => {
    const auth = requirePermission(request, 'property:write');
    const input = parse(createAreaSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        'insert into areas (org_id, name, code, description) values ($1,$2,$3,$4) returning id',
        [auth.orgId, input.name, input.code ?? null, input.description ?? null],
      );
      await audit(request, { action: 'area.created', entityType: 'area', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/properties', async (request) => {
    const auth = requirePermission(request, 'property:write');
    const input = parse(createPropertySchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into properties (org_id, area_id, name, designation, street, postal_code, city,
                                 latitude, longitude)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          auth.orgId,
          input.areaId,
          input.name,
          input.designation ?? null,
          input.street,
          input.postalCode ?? null,
          input.city,
          input.latitude ?? null,
          input.longitude ?? null,
        ],
      );
      await audit(request, { action: 'property.created', entityType: 'property', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/buildings', async (request) => {
    const auth = requirePermission(request, 'property:write');
    const input = parse(createBuildingSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into buildings (org_id, property_id, name, street, construction_year, floors, has_elevator)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          auth.orgId,
          input.propertyId,
          input.name,
          input.street,
          input.constructionYear ?? null,
          input.floors ?? null,
          input.hasElevator,
        ],
      );
      await audit(request, { action: 'building.created', entityType: 'building', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/entrances', async (request) => {
    const auth = requirePermission(request, 'property:write');
    const input = parse(createEntranceSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        'insert into entrances (org_id, building_id, name, street) values ($1,$2,$3,$4) returning id',
        [auth.orgId, input.buildingId, input.name, input.street],
      );
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/units', async (request) => {
    const auth = requirePermission(request, 'property:write');
    const input = parse(createUnitSchema, request.body);
    return db(request, async (client) => {
      const existing = await client.query('select 1 from units where object_number = $1', [
        input.objectNumber,
      ]);
      if (existing.rowCount) throw conflict('Objektnumret finns redan.');
      const result = await client.query<{ id: string }>(
        `insert into units (org_id, entrance_id, object_number, label, floor, rooms, area_sqm, kind)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [
          auth.orgId,
          input.entranceId,
          input.objectNumber,
          input.label,
          input.floor ?? null,
          input.rooms ?? null,
          input.areaSqm ?? null,
          input.kind,
        ],
      );
      await audit(request, { action: 'unit.created', entityType: 'unit', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  /* ------------------------------------------------------- avtal --- */

  app.post('/api/staff/tenancies', async (request) => {
    const auth = requirePermission(request, 'tenancy:write');
    const input = parse(createTenancySchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into tenancies (org_id, unit_id, external_ref, starts_at, ends_at, earliest_move_out,
                                monthly_rent_ore, status)
         values ($1,$2,$3,$4,$5,$6,$7, case when $4::date > current_date then 'upcoming' else 'active' end)
         returning id`,
        [
          auth.orgId,
          input.unitId,
          input.externalRef ?? null,
          input.startsAt,
          input.endsAt ?? null,
          input.earliestMoveOut ?? null,
          input.monthlyRentOre ?? null,
        ],
      );
      const tenancyId = result.rows[0]!.id;
      await ensureMoveFlow(client, auth.orgId, tenancyId, 'move_in', input.startsAt);
      await audit(request, { action: 'tenancy.created', entityType: 'tenancy', entityId: tenancyId });
      return { id: tenancyId };
    });
  });

  /**
   * Inbjudan till appen. Koden visas en gång för handläggaren och lagras enbart
   * som hash – den kan inte läsas ut i efterhand.
   */
  app.post('/api/staff/invitations', async (request) => {
    const auth = requirePermission(request, 'resident:write');
    const input = parse(inviteResidentSchema, request.body);
    return db(request, async (client) => {
      const tenancy = await client.query('select 1 from tenancies where id = $1', [input.tenancyId]);
      if (!tenancy.rowCount) throw notFound('Avtalet hittades inte.');

      const code = generateInvitationCode();
      const result = await client.query<{ id: string }>(
        `insert into invitations (org_id, code_hash, email, tenancy_id, role, invited_by, expires_at)
         values ($1,$2,$3,$4,$5,$6, now() + interval '60 days') returning id`,
        [auth.orgId, hashToken(code), input.email, input.tenancyId, input.role, auth.userId],
      );
      await audit(request, {
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: result.rows[0]!.id,
        detail: { role: input.role, tenancyId: input.tenancyId },
      });
      return { id: result.rows[0]!.id, code, expiresInDays: 60 };
    });
  });

  /** Hyresgästen bjuder själv in en medboende (krav B.1.1, B.1.2). */
  app.post('/api/me/invite-co-resident', async (request) => {
    const auth = requirePermission(request, 'self:update');
    const body = request.body as { email?: string; firstName?: string; lastName?: string; tenancyId?: string };
    const tenancyId = body?.tenancyId ?? auth.tenancyIds[0];
    if (!tenancyId || !auth.tenancyIds.includes(tenancyId)) throw notFound('Avtalet hittades inte.');

    return db(request, async (client) => {
      // Högst en medboende per avtal.
      const existing = await client.query<{ count: number }>(
        `select count(*)::int as count from tenancy_residents
          where tenancy_id = $1 and role = 'co_resident' and moved_out_at is null`,
        [tenancyId],
      );
      const pending = await client.query<{ count: number }>(
        `select count(*)::int as count from invitations
          where tenancy_id = $1 and role = 'co_resident' and used_at is null and expires_at > now()`,
        [tenancyId],
      );
      if ((existing.rows[0]?.count ?? 0) + (pending.rows[0]?.count ?? 0) >= 1) {
        throw conflict('Det går att bjuda in en medboende per bostad.');
      }

      const code = generateInvitationCode();
      await client.query(
        `insert into invitations (org_id, code_hash, email, tenancy_id, role, invited_by, expires_at)
         values ($1,$2,$3,$4,'co_resident',$5, now() + interval '30 days')`,
        [auth.orgId, hashToken(code), body?.email ?? null, tenancyId, auth.userId],
      );
      await audit(request, { action: 'invitation.co_resident_created', entityType: 'tenancy', entityId: tenancyId });
      return { code, expiresInDays: 30 };
    });
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>('/api/staff/residents', async (request) => {
    const auth = requirePermission(request, 'resident:read');
    return db(request, async (client) => {
      const params: unknown[] = [];
      const where: string[] = [
        scopeCondition(auth.scopes, { areaId: 'uh.area_id', propertyId: 'uh.property_id' }, params),
      ];
      if (request.query.q) {
        params.push(`%${request.query.q}%`);
        const i = params.length;
        where.push(
          `(u.first_name ilike $${i} or u.last_name ilike $${i} or u.email ilike $${i} or uh.object_number ilike $${i})`,
        );
      }
      params.push(Math.min(Number(request.query.limit ?? 50) || 50, 200));
      const result = await client.query(
        `select u.id, u.first_name, u.last_name, u.email, u.phone, u.locale, u.status,
                u.last_login_at, tr.role, tr.is_primary,
                t.id as tenancy_id, t.status as tenancy_status,
                uh.object_number, uh.unit_label, uh.property_name, uh.property_street
           from users u
           join tenancy_residents tr on tr.user_id = u.id and tr.moved_out_at is null
           join tenancies t on t.id = tr.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
          where ${where.join(' and ')}
          order by u.last_name, u.first_name
          limit $${params.length}`,
        params,
      );
      return { residents: result.rows };
    });
  });
}
