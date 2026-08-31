import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  APP_TIME_ZONE,
  blockResourceSchema,
  bookingSlotQuerySchema,
  createBookingSchema,
  createResourceSchema,
} from '@hemvist/shared';
import { audit, auditWithin } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';

/**
 * Bokning av gemensamma resurser och besök.
 *
 * Dubbelbokning hindras av en uteslutningsregel i databasen, inte enbart av en
 * kontroll i koden. Två samtidiga bokningsförsök på samma tid ger därför alltid
 * ett tydligt fel i stället för två bokningar.
 */

/** Resurser som gäller för hyresgästens bostäder. */
const RESIDENT_RESOURCE_SQL = `
  select distinct r.*
    from resources r
    join tenancies t on t.id = any($1::uuid[])
    join unit_hierarchy uh on uh.unit_id = t.unit_id
   where r.active
     and (
          r.scope = 'organisation'
       or (r.scope = 'area'     and r.scope_id = uh.area_id)
       or (r.scope = 'property' and r.scope_id = uh.property_id)
       or (r.scope = 'building' and r.scope_id = uh.building_id)
       or (r.scope = 'entrance' and r.scope_id = uh.entrance_id)
       or (r.scope = 'unit'     and r.scope_id = uh.unit_id)
     )`;

export async function registerBookingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/booking/resources', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:booking:manage');
    return db(request, async (client) => {
      const result = await client.query(
        `${RESIDENT_RESOURCE_SQL} order by r.kind, r.name`,
        [auth.tenancyIds],
      );
      const active = await client.query<{ resource_id: string; count: number }>(
        `select resource_id, count(*)::int as count
           from bookings
          where user_id = $1 and status in ('reserved','confirmed') and upper(slot) > now()
          group by resource_id`,
        [auth.userId],
      );
      const counts = new Map(active.rows.map((r) => [r.resource_id, r.count]));
      return {
        resources: result.rows.map((r) => ({
          ...r,
          activeBookings: counts.get(r.id as string) ?? 0,
          // Digital passerkod visas bara när det finns en verklig låsintegration.
          digitalAccess: false,
        })),
      };
    });
  });

  app.get<{ Params: { id: string }; Querystring: { from: string; to: string } }>(
    '/api/booking/resources/:id/slots',
    async (request) => {
      const auth = requireAuth(request);
      const query = parse(bookingSlotQuerySchema, request.query);
      if (new Date(query.to) < new Date(query.from)) throw badRequest('Ogiltigt datumintervall.');
      const span = (new Date(query.to).getTime() - new Date(query.from).getTime()) / 86_400_000;
      if (span > 45) throw badRequest('Välj ett kortare datumintervall.');

      return db(request, async (client) => {
        const resource = await loadResourceForUser(client, auth, request.params.id);
        const result = await client.query(
          `with r as (select * from resources where id = $1),
               days as (select generate_series($2::date, $3::date, interval '1 day')::date as day),
               idx as (select generate_series(0, 95) as i),
               raw as (
                 select timezone($5, (d.day + r.opens_at)::timestamp)
                          + make_interval(mins => r.slot_minutes * i.i) as starts_at,
                        timezone($5, (d.day + r.opens_at)::timestamp)
                          + make_interval(mins => r.slot_minutes * (i.i + 1)) as ends_at,
                        timezone($5, (d.day + r.closes_at)::timestamp) as day_end,
                        r.max_days_ahead
                   from days d cross join idx i cross join r
               )
           select raw.starts_at,
                  raw.ends_at,
                  b.id            as booking_id,
                  b.user_id       as booked_by,
                  (b.user_id = $4) as is_mine,
                  bl.reason       as block_reason,
                  (raw.starts_at < now()) as in_past,
                  (raw.starts_at > now() + make_interval(days => raw.max_days_ahead)) as too_far_ahead
             from raw
             left join bookings b
               on b.resource_id = $1
              and b.status in ('reserved','confirmed')
              and b.slot && tstzrange(raw.starts_at, raw.ends_at)
             left join resource_blocks bl
               on bl.resource_id = $1
              and bl.slot && tstzrange(raw.starts_at, raw.ends_at)
            where raw.ends_at <= raw.day_end
            order by raw.starts_at`,
          [resource.id, query.from, query.to, auth.userId, APP_TIME_ZONE],
        );

        return {
          resource,
          slots: result.rows.map((row) => ({
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            status: row.block_reason
              ? 'blocked'
              : row.is_mine
                ? 'mine'
                : row.booking_id
                  ? 'taken'
                  : row.in_past || row.too_far_ahead
                    ? 'unavailable'
                    : 'available',
            blockReason: row.block_reason,
          })),
        };
      });
    },
  );

  app.get('/api/bookings', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, b.status, b.note,
                b.price_ore, b.deposit_ore, b.access_code, b.case_id, b.created_at, b.cancelled_at,
                r.id as resource_id, r.name as resource_name, r.kind as resource_kind,
                r.cancellation_hours,
                (upper(b.slot) > now()) as upcoming
           from bookings b join resources r on r.id = b.resource_id
          where b.user_id = $1
          order by lower(b.slot) desc limit 100`,
        [auth.userId],
      );
      const waitlist = await client.query(
        `select w.id, r.name as resource_name, lower(w.slot) as starts_at, upper(w.slot) as ends_at,
                w.created_at, w.notified_at
           from booking_waitlist w join resources r on r.id = w.resource_id
          where w.user_id = $1 and w.cancelled_at is null and w.fulfilled_at is null
          order by w.created_at desc`,
        [auth.userId],
      );
      return { bookings: result.rows, waitlist: waitlist.rows };
    });
  });

  app.post('/api/bookings', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:booking:manage');
    const input = parse(createBookingSchema, request.body);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt) throw badRequest('Sluttiden måste vara efter starttiden.');
    if (startsAt < new Date()) throw badRequest('Det går inte att boka en tid som har passerat.');

    return db(request, async (client) => {
      const resource = await loadResourceForUser(client, auth, input.resourceId);

      const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
      if (durationMinutes % resource.slot_minutes !== 0) {
        throw badRequest('Välj en tid som följer resursens bokningspass.');
      }

      const maxAhead = new Date(Date.now() + resource.max_days_ahead * 86_400_000);
      if (startsAt > maxAhead) {
        throw badRequest(`Resursen går att boka högst ${resource.max_days_ahead} dagar i förväg.`);
      }

      const active = await client.query<{ count: number }>(
        `select count(*)::int as count from bookings
          where resource_id = $1 and user_id = $2 and status in ('reserved','confirmed')
            and upper(slot) > now()`,
        [resource.id, auth.userId],
      );
      if ((active.rows[0]?.count ?? 0) >= resource.max_active_per_tenancy) {
        throw conflict(
          `Du kan ha högst ${resource.max_active_per_tenancy} aktiva bokningar av ${resource.name}.`,
        );
      }

      const blocked = await client.query(
        'select reason from resource_blocks where resource_id = $1 and slot && tstzrange($2,$3)',
        [resource.id, startsAt, endsAt],
      );
      if (blocked.rowCount) {
        throw conflict(`Tiden är inte bokningsbar: ${blocked.rows[0]!.reason}`);
      }

      const tenancyId = await tenancyForResource(client, auth, resource);

      try {
        const inserted = await client.query<{ id: string }>(
          `insert into bookings (org_id, resource_id, tenancy_id, user_id, slot, status, note,
                                 price_ore, deposit_ore, created_by)
           values ($1,$2,$3,$4, tstzrange($5,$6), $7, $8, $9, $10, $4)
           returning id`,
          [
            auth.orgId,
            resource.id,
            tenancyId,
            auth.userId,
            startsAt,
            endsAt,
            resource.requires_approval ? 'reserved' : 'confirmed',
            input.note ?? null,
            resource.price_ore,
            resource.deposit_ore,
          ],
        );
        const bookingId = inserted.rows[0]!.id;

        await notify(client, {
          orgId: auth.orgId,
          userIds: [auth.userId],
          topic: 'bookings',
          title: `${resource.name} är bokad`,
          body: `Din tid är bokad. Avbokning senast ${resource.cancellation_hours} timmar innan.`,
          linkRoute: 'booking',
          linkId: bookingId,
          dedupeKey: `booking:${bookingId}`,
        });
        await auditWithin(
          client,
          { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, actorRoles: auth.roles, ip: request.ip, traceId: request.traceId },
          { action: 'booking.created', entityType: 'booking', entityId: bookingId },
        );

        return {
          booking: {
            id: bookingId,
            resourceName: resource.name,
            startsAt,
            endsAt,
            status: resource.requires_approval ? 'reserved' : 'confirmed',
            priceOre: resource.price_ore,
            depositOre: resource.deposit_ore,
          },
        };
      } catch (error) {
        // Uteslutningsregeln i databasen fångar dubbelbokning.
        if ((error as { code?: string }).code === '23P01') {
          if (input.joinWaitlist && resource.waitlist_enabled) {
            const wait = await client.query<{ id: string }>(
              `insert into booking_waitlist (org_id, resource_id, user_id, tenancy_id, slot)
               values ($1,$2,$3,$4, tstzrange($5,$6))
               on conflict (resource_id, user_id, slot) do update set cancelled_at = null
               returning id`,
              [auth.orgId, resource.id, auth.userId, tenancyId, startsAt, endsAt],
            );
            return { waitlisted: true, waitlistId: wait.rows[0]!.id };
          }
          throw conflict('Tiden är redan bokad. Välj en annan tid.');
        }
        throw error;
      }
    });
  });

  app.delete<{ Params: { id: string } }>('/api/bookings/:id', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string | null;
        starts_at: Date;
        status: string;
        cancellation_hours: number;
        resource_id: string;
        resource_name: string;
        slot_start: Date;
        slot_end: Date;
      }>(
        `select b.id, b.user_id, lower(b.slot) as starts_at, b.status, r.cancellation_hours,
                r.id as resource_id, r.name as resource_name,
                lower(b.slot) as slot_start, upper(b.slot) as slot_end
           from bookings b join resources r on r.id = b.resource_id
          where b.id = $1`,
        [request.params.id],
      );
      const booking = result.rows[0];
      if (!booking) throw notFound('Bokningen hittades inte.');

      const isOwner = booking.user_id === auth.userId;
      const isStaff = auth.permissions.has('booking:write');
      if (!isOwner && !isStaff) throw forbidden();
      if (booking.status === 'cancelled') return { status: 'cancelled' };

      if (isOwner && !isStaff) {
        const deadline = new Date(booking.starts_at.getTime() - booking.cancellation_hours * 3_600_000);
        if (new Date() > deadline) {
          throw conflict(
            `Avbokning måste ske senast ${booking.cancellation_hours} timmar före bokad tid.`,
          );
        }
      }

      await client.query(
        `update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2 where id = $1`,
        [booking.id, auth.userId],
      );

      // Först i väntelistan får besked om att tiden blivit ledig.
      const next = await client.query<{ id: string; user_id: string }>(
        `select id, user_id from booking_waitlist
          where resource_id = $1 and slot && tstzrange($2,$3)
            and cancelled_at is null and fulfilled_at is null and notified_at is null
          order by created_at limit 1`,
        [booking.resource_id, booking.slot_start, booking.slot_end],
      );
      if (next.rows[0]) {
        await client.query('update booking_waitlist set notified_at = now() where id = $1', [
          next.rows[0].id,
        ]);
        await notify(client, {
          orgId: auth.orgId,
          userIds: [next.rows[0].user_id],
          topic: 'bookings',
          title: `En tid har blivit ledig`,
          body: `${booking.resource_name} har fått en ledig tid som du stod i kö för.`,
          linkRoute: 'booking',
          linkId: booking.resource_id,
          dedupeKey: `waitlist:${next.rows[0].id}`,
        });
      }

      await audit(request, { action: 'booking.cancelled', entityType: 'booking', entityId: booking.id });
      return { status: 'cancelled' };
    });
  });

  /** Bokningen kan läggas till i användarens egen kalender (avsnitt 8). */
  app.get<{ Params: { id: string } }>('/api/bookings/:id/calendar.ics', async (request, reply) => {
    const auth = requireAuth(request);
    const booking = await db(request, async (client) => {
      const result = await client.query<{
        id: string;
        starts_at: Date;
        ends_at: Date;
        resource_name: string;
        note: string | null;
        user_id: string | null;
        org_name: string;
      }>(
        `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, r.name as resource_name,
                b.note, b.user_id, o.display_name as org_name
           from bookings b
           join resources r on r.id = b.resource_id
           join organisations o on o.id = b.org_id
          where b.id = $1`,
        [request.params.id],
      );
      const row = result.rows[0];
      if (!row) throw notFound('Bokningen hittades inte.');
      if (row.user_id !== auth.userId && !auth.permissions.has('booking:read')) throw forbidden();
      return row;
    });

    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hemvist//SV',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${booking.id}@hemvist`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(booking.starts_at)}`,
      `DTEND:${stamp(booking.ends_at)}`,
      `SUMMARY:${booking.resource_name} – ${booking.org_name}`,
      booking.note ? `DESCRIPTION:${booking.note.replace(/\n/g, '\\n')}` : 'DESCRIPTION:Bokning',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="bokning.ics"');
    return reply.send(ics);
  });

  /* ------------------------------------------------- administration --- */

  app.get('/api/staff/resources', async (request) => {
    requirePermission(request, 'booking:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select r.*,
                (select count(*)::int from bookings b
                  where b.resource_id = r.id and b.status in ('reserved','confirmed')
                    and upper(b.slot) > now()) as upcoming_bookings
           from resources r order by r.kind, r.name`,
      );
      return { resources: result.rows };
    });
  });

  app.post('/api/staff/resources', async (request) => {
    const auth = requirePermission(request, 'resource:write');
    const input = parse(createResourceSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into resources (org_id, kind, name, description, scope, scope_id, slot_minutes,
                                opens_at, closes_at, max_active_per_tenancy, max_days_ahead,
                                cancellation_hours, price_ore, deposit_ore, requires_approval,
                                waitlist_enabled, active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
        [
          auth.orgId,
          input.kind,
          input.name,
          input.description ?? null,
          input.scope,
          input.scopeId ?? null,
          input.slotMinutes,
          input.opensAt,
          input.closesAt,
          input.maxActivePerTenancy,
          input.maxDaysAhead,
          input.cancellationHours,
          input.priceOre,
          input.depositOre,
          input.requiresApproval,
          input.waitlistEnabled,
          input.active,
        ],
      );
      await audit(request, { action: 'resource.created', entityType: 'resource', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });

  app.post('/api/staff/resource-blocks', async (request) => {
    const auth = requirePermission(request, 'resource:write');
    const input = parse(blockResourceSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into resource_blocks (org_id, resource_id, slot, reason, created_by)
         values ($1,$2, tstzrange($3,$4), $5, $6) returning id`,
        [auth.orgId, input.resourceId, input.startsAt, input.endsAt, input.reason, auth.userId],
      );

      // Bokningar som redan ligger i den spärrade tiden måste hanteras.
      const affected = await client.query<{ id: string; user_id: string | null }>(
        `select id, user_id from bookings
          where resource_id = $1 and status in ('reserved','confirmed') and slot && tstzrange($2,$3)`,
        [input.resourceId, input.startsAt, input.endsAt],
      );
      for (const booking of affected.rows) {
        await client.query(
          `update bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
                  cancel_reason = $3 where id = $1`,
          [booking.id, auth.userId, input.reason],
        );
        if (booking.user_id) {
          await notify(client, {
            orgId: auth.orgId,
            userIds: [booking.user_id],
            topic: 'bookings',
            title: 'Din bokning har blivit avbokad',
            body: input.reason,
            linkRoute: 'bookings',
            linkId: booking.id,
            dedupeKey: `booking-cancelled:${booking.id}`,
          });
        }
      }

      await audit(request, {
        action: 'resource.blocked',
        entityType: 'resource',
        entityId: input.resourceId,
        detail: { cancelledBookings: affected.rowCount ?? 0 },
      });
      return { id: result.rows[0]!.id, cancelledBookings: affected.rowCount ?? 0 };
    });
  });

  app.get<{ Querystring: { from?: string; to?: string } }>('/api/staff/bookings', async (request) => {
    requirePermission(request, 'booking:read');
    const from = request.query.from ?? new Date().toISOString().slice(0, 10);
    const to = request.query.to ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    return db(request, async (client) => {
      const result = await client.query(
        `select b.id, lower(b.slot) as starts_at, upper(b.slot) as ends_at, b.status, b.note,
                b.case_id, r.name as resource_name, r.kind as resource_kind,
                u.first_name, u.last_name, uh.object_number, uh.property_name
           from bookings b
           join resources r on r.id = b.resource_id
           left join users u on u.id = b.user_id
           left join tenancies t on t.id = b.tenancy_id
           left join unit_hierarchy uh on uh.unit_id = t.unit_id
          where b.slot && tstzrange($1::date::timestamptz, ($2::date + 1)::timestamptz)
          order by lower(b.slot)`,
        [from, to],
      );
      return { bookings: result.rows };
    });
  });
}

interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  scope: string;
  scope_id: string | null;
  slot_minutes: number;
  max_active_per_tenancy: number;
  max_days_ahead: number;
  cancellation_hours: number;
  price_ore: number;
  deposit_ore: number;
  requires_approval: boolean;
  waitlist_enabled: boolean;
}

async function loadResourceForUser(
  client: pg.PoolClient,
  auth: import('../core/context.js').AuthContext,
  resourceId: string,
): Promise<ResourceRow> {
  if (auth.surface === 'staff') {
    const staffResult = await client.query<ResourceRow>('select * from resources where id = $1', [
      resourceId,
    ]);
    const row = staffResult.rows[0];
    if (!row) throw notFound('Resursen hittades inte.');
    return row;
  }
  // Hyresgästen når bara resurser som hör till den egna adressen.
  const result = await client.query<ResourceRow>(
    `${RESIDENT_RESOURCE_SQL} and r.id = $2`,
    [auth.tenancyIds, resourceId],
  );
  const row = result.rows[0];
  if (!row) throw notFound('Resursen är inte bokningsbar för din adress.');
  return row;
}

async function tenancyForResource(
  client: pg.PoolClient,
  auth: import('../core/context.js').AuthContext,
  resource: ResourceRow,
): Promise<string | null> {
  if (auth.tenancyIds.length === 0) return null;
  if (resource.scope === 'organisation') return auth.tenancyIds[0] ?? null;
  const result = await client.query<{ id: string }>(
    `select t.id from tenancies t join unit_hierarchy uh on uh.unit_id = t.unit_id
      where t.id = any($1::uuid[])
        and case $2
              when 'area'     then uh.area_id
              when 'property' then uh.property_id
              when 'building' then uh.building_id
              when 'entrance' then uh.entrance_id
              when 'unit'     then uh.unit_id
            end = $3
      limit 1`,
    [auth.tenancyIds, resource.scope, resource.scope_id],
  );
  return result.rows[0]?.id ?? auth.tenancyIds[0] ?? null;
}
