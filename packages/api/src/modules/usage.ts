import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { respondentKey } from '../core/crypto.js';
import { parse } from '../core/validate.js';

/**
 * Användningsstatistik (krav A.3.12, A.3.13, A.3.14).
 *
 * Registreringen sker med en dagsnyckel i stället för användarens id. Det
 * räcker för att räkna hur många som använt en meny, men går inte att använda
 * för att följa en enskild person. Nyckeln byts varje dygn.
 */

const recordSchema = z.object({
  events: z
    .array(
      z.object({
        kind: z.enum(['menu', 'view', 'notice']),
        key: z.string().trim().min(1).max(120),
      }),
    )
    .min(1)
    .max(40),
});

/** Pseudonym som gäller ett dygn. Samma person får ny nyckel i morgon. */
function dayKey(userId: string, day: string): string {
  return respondentKey(`anvandning-${day}`, userId);
}

export async function registerUsageRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/usage', async (request) => {
    const auth = requireAuth(request);
    const input = parse(recordSchema, request.body);

    return db(request, async (client) => {
      // Området hämtas från användarens aktiva hyresförhållande, för att kunna
      // dela upp statistiken per område utan att spara vem det var.
      const area = auth.tenancyIds.length
        ? await client.query<{ area_id: string }>(
            `select p.area_id
               from tenancies t
               join units u on u.id = t.unit_id
               join entrances e on e.id = u.entrance_id
               join buildings b on b.id = e.building_id
               join properties p on p.id = b.property_id
              where t.id = any($1::uuid[]) limit 1`,
            [auth.tenancyIds],
          )
        : { rows: [] as { area_id: string }[] };

      const today = new Date().toISOString().slice(0, 10);
      const subject = dayKey(auth.userId, today);

      for (const event of input.events) {
        await client.query(
          `insert into usage_events (org_id, kind, key, area_id, subject_key, surface)
           values ($1,$2,$3,$4,$5,$6)
           on conflict do nothing`,
          [
            auth.orgId,
            event.kind,
            event.key,
            area.rows[0]?.area_id ?? null,
            subject,
            auth.surface === 'integration' ? 'staff' : auth.surface,
          ],
        );
      }
      return { recorded: input.events.length };
    });
  });

  /**
   * Sammanställning för förvaltningen. Redovisar antal användare, inte antal
   * klick, eftersom det är frågan kravet ställer.
   */
  app.get<{ Querystring: { days?: string } }>('/api/staff/analytics/usage', async (request) => {
    requirePermission(request, 'analytics:read');
    const days = Math.min(Math.max(Number(request.query.days ?? 30) || 30, 1), 365);

    return db(request, async (client) => {
      const byKey = await client.query(
        `select kind, key,
                count(distinct subject_key)::int as users,
                count(*)::int as days_used,
                max(day) as last_used
           from usage_events
          where day > current_date - $1::int
          group by kind, key
          order by users desc, key
          limit 100`,
        [days],
      );

      const byArea = await client.query(
        `select coalesce(a.name, 'Utan område') as area, u.kind, u.key,
                count(distinct u.subject_key)::int as users
           from usage_events u
           left join areas a on a.id = u.area_id
          where u.day > current_date - $1::int
          group by a.name, u.kind, u.key
          order by users desc
          limit 200`,
        [days],
      );

      const overTime = await client.query(
        `select day, count(distinct subject_key)::int as users
           from usage_events
          where day > current_date - $1::int
          group by day order by day`,
        [days],
      );

      // Aktiva kunder: de som faktiskt loggat in under perioden (krav A.3.12).
      // Både hyresgäst och medboende räknas som kund.
      const activeCustomers = await client.query<{ count: number }>(
        `select count(distinct s.user_id)::int as count
           from sessions s
           join user_roles r on r.user_id = s.user_id
          where r.role in ('tenant', 'co_resident')
            and s.created_at > now() - make_interval(days => $1)`,
        [days],
      );

      const totalCustomers = await client.query<{ count: number }>(
        `select count(distinct user_id)::int as count
           from user_roles where role in ('tenant', 'co_resident')`,
      );

      return {
        days,
        activeCustomers: activeCustomers.rows[0]?.count ?? 0,
        totalCustomers: totalCustomers.rows[0]?.count ?? 0,
        byKey: byKey.rows,
        byArea: byArea.rows,
        overTime: overTime.rows,
      };
    });
  });
}
