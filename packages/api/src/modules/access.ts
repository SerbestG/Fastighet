import type { FastifyInstance } from 'fastify';
import { createAccessPointSchema, grantAccessSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, notFound } from '../core/errors.js';
import { parse } from '../core/validate.js';

/**
 * Nycklar och passagebehörigheter.
 *
 * En digital nyckel eller en aktiv behörighet visas aldrig utan att den
 * bakomliggande integrationen är i status "Ansluten". Utan integration redovisar
 * appen enbart vilka passagepunkter som hör till bostaden, och att digitala
 * nycklar inte är tillgängliga (avsnitt 14 i kravbilden).
 *
 * Alla tillträdesändringar loggas och kan återkallas.
 */
export async function registerAccessRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/access', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const points = await client.query(
        `select distinct ap.id, ap.kind, ap.name, ap.scope, ap.integration_id,
                i.status as integration_status, i.name as integration_name
           from access_points ap
           left join integrations i on i.id = ap.integration_id
           join tenancies t on t.id = any($1::uuid[])
           join unit_hierarchy uh on uh.unit_id = t.unit_id
          where ap.scope = 'organisation'
             or (ap.scope = 'area' and ap.scope_id = uh.area_id)
             or (ap.scope = 'property' and ap.scope_id = uh.property_id)
             or (ap.scope = 'building' and ap.scope_id = uh.building_id)
             or (ap.scope = 'entrance' and ap.scope_id = uh.entrance_id)
             or (ap.scope = 'unit' and ap.scope_id = uh.unit_id)
          order by ap.kind`,
        [auth.tenancyIds],
      );

      const grants = await client.query(
        `select g.id, g.access_point_id, g.valid_from, g.valid_to, g.status, ap.name, ap.kind,
                i.status as integration_status
           from access_grants g
           join access_points ap on ap.id = g.access_point_id
           left join integrations i on i.id = ap.integration_id
          where g.user_id = $1 and g.status in ('pending','active')
          order by g.valid_from desc`,
        [auth.userId],
      );

      return {
        accessPoints: points.rows.map((point) => ({
          ...point,
          // Digital nyckel kräver en verkligt ansluten integration.
          digitalKeyAvailable: point.integration_status === 'connected',
        })),
        grants: grants.rows.filter((g) => g.integration_status === 'connected'),
        digitalKeys: {
          available: points.rows.some((p) => p.integration_status === 'connected'),
          reason:
            'Digitala nycklar visas när integrationen mot passersystemet är ansluten och konfigurerad.',
        },
      };
    });
  });

  /* ------------------------------------------------- administration --- */

  app.get('/api/staff/access-points', async (request) => {
    requirePermission(request, 'access:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select ap.id, ap.kind, ap.name, ap.scope, ap.scope_id, ap.external_ref,
                i.name as integration_name, i.status as integration_status,
                (select count(*)::int from access_grants g
                  where g.access_point_id = ap.id and g.status = 'active') as active_grants
           from access_points ap left join integrations i on i.id = ap.integration_id
          order by ap.kind, ap.name`,
      );
      return { accessPoints: result.rows };
    });
  });

  app.post('/api/staff/access-points', async (request) => {
    const auth = requirePermission(request, 'access:write');
    const input = parse(createAccessPointSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into access_points (org_id, kind, name, scope, scope_id, integration_id)
         values ($1,$2,$3,$4,$5,$6) returning id`,
        [auth.orgId, input.kind, input.name, input.scope, input.scopeId ?? null, input.integrationId ?? null],
      );
      await audit(request, { action: 'access.point_created', entityType: 'access_point', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/access-grants', async (request) => {
    const auth = requirePermission(request, 'access:write');
    const input = parse(grantAccessSchema, request.body);
    return db(request, async (client) => {
      const point = await client.query<{ id: string; integration_id: string | null; status: string | null }>(
        `select ap.id, ap.integration_id, i.status
           from access_points ap left join integrations i on i.id = ap.integration_id
          where ap.id = $1`,
        [input.accessPointId],
      );
      if (!point.rowCount) throw notFound('Passagepunkten hittades inte.');

      // Behörigheten registreras alltid, men blir aktiv först när den kunnat
      // skrivas till passersystemet.
      const connected = point.rows[0]!.status === 'connected';
      const result = await client.query<{ id: string }>(
        `insert into access_grants (org_id, access_point_id, user_id, valid_from, valid_to, status,
                                    reason, granted_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [
          auth.orgId,
          input.accessPointId,
          input.userId,
          input.validFrom,
          input.validTo ?? null,
          connected ? 'active' : 'pending',
          input.reason ?? null,
          auth.userId,
        ],
      );
      await client.query(
        `insert into access_events (org_id, grant_id, access_point_id, kind, actor_user_id, detail)
         values ($1,$2,$3,'granted',$4,$5)`,
        [
          auth.orgId,
          result.rows[0]!.id,
          input.accessPointId,
          auth.userId,
          JSON.stringify({ connected, reason: input.reason ?? null }),
        ],
      );
      await audit(request, {
        action: 'access.granted',
        entityType: 'access_grant',
        entityId: result.rows[0]!.id,
        subjectUserId: input.userId,
        detail: { pending: !connected },
      });
      return {
        id: result.rows[0]!.id,
        status: connected ? 'active' : 'pending',
        note: connected ? null : 'Behörigheten aktiveras när passersystemet är anslutet.',
      };
    });
  });

  app.post<{ Params: { id: string } }>('/api/staff/access-grants/:id/revoke', async (request) => {
    const auth = requirePermission(request, 'access:write');
    const body = request.body as { reason?: string } | undefined;
    return db(request, async (client) => {
      const result = await client.query<{ id: string; access_point_id: string; user_id: string | null }>(
        `update access_grants set status = 'revoked', revoked_at = now(), revoked_by = $2
          where id = $1 and status <> 'revoked'
          returning id, access_point_id, user_id`,
        [request.params.id, auth.userId],
      );
      if (!result.rowCount) throw notFound('Behörigheten hittades inte.');
      await client.query(
        `insert into access_events (org_id, grant_id, access_point_id, kind, actor_user_id, detail)
         values ($1,$2,$3,'revoked',$4,$5)`,
        [
          auth.orgId,
          result.rows[0]!.id,
          result.rows[0]!.access_point_id,
          auth.userId,
          JSON.stringify({ reason: body?.reason ?? null }),
        ],
      );
      await audit(request, {
        action: 'access.revoked',
        entityType: 'access_grant',
        entityId: request.params.id,
        subjectUserId: result.rows[0]!.user_id,
      });
      return { revoked: true };
    });
  });

  app.get<{ Querystring: { limit?: string } }>('/api/staff/access-events', async (request) => {
    requirePermission(request, 'access:read');
    const limit = Math.min(Number(request.query.limit ?? 100) || 100, 500);
    return db(request, async (client) => {
      const result = await client.query(
        `select e.id, e.at, e.kind, e.detail, ap.name as access_point_name, ap.kind as access_point_kind,
                u.first_name, u.last_name
           from access_events e
           left join access_points ap on ap.id = e.access_point_id
           left join users u on u.id = e.actor_user_id
          order by e.at desc limit $1`,
        [limit],
      );
      return { events: result.rows };
    });
  });
}
